#!/usr/bin/env node

/**
 * Fast gate enforcement - deterministic rules before calling Gemini
 * Usage: node enforce-gate.mjs <artifacts.json> <profiles.json> [--dry-run]
 *
 * Returns verdict JSON with status: pass|fail|inconclusive
 */

import { promises as fs } from 'fs';
import { basename } from 'path';

async function enforceGate(artifactsPath, profilesPath, dryRun = false) {
    // Load artifacts and profiles
    const artifacts = JSON.parse(await fs.readFile(artifactsPath, 'utf8'));
    const profiles = profilesPath ? JSON.parse(await fs.readFile(profilesPath, 'utf8')) : {};

    // Extract task info
    const taskId = artifacts.task_id;
    const artifactList = artifacts.artifacts || [];

    // Load commitment if available
    const commitmentPath = artifactsPath.replace('artifacts.json', 'commitment.json');
    let commitment = {};
    try {
        commitment = JSON.parse(await fs.readFile(commitmentPath, 'utf8'));
    } catch (e) {
        // No commitment file
    }

    // Load claim if available
    const claimPath = artifactsPath.replace('artifacts.json', 'claim.json');
    let claim = {};
    try {
        claim = JSON.parse(await fs.readFile(claimPath, 'utf8'));
    } catch (e) {
        // No claim file
    }

    // Get profile for this task type
    const taskType = commitment.type || claim.claim?.type || claim.claimed?.type || 'unknown';
    const profileName = commitment.profile || `${taskType}_default`;
    const profile = profiles[profileName] || {};

    // Initialize verdict
    const verdict = {
        task_id: taskId,
        status: 'inconclusive',
        type: taskType,
        profile: profileName,
        checks: [],
        reasons: [],
        timestamp: new Date().toISOString()
    };

    // Run deterministic checks based on profile

    // Check 1: Expected units vs claimed units
    if (commitment.commitments?.expected_total) {
        const expected = commitment.commitments.expected_total;
        const claimed = claim.claim?.units_total || claim.claimed?.units_total || 0;

        if (claimed < expected) {
            verdict.checks.push({
                name: 'units_count',
                expected,
                actual: claimed,
                passed: false
            });
            verdict.reasons.push(`Claimed ${claimed} units but expected ${expected}`);
            verdict.status = 'fail';
        } else {
            verdict.checks.push({
                name: 'units_count',
                expected,
                actual: claimed,
                passed: true
            });
        }
    }

    // Check 2: Required artifacts exist
    if (profile.required_artifacts) {
        for (const required of profile.required_artifacts) {
            const found = artifactList.some(a => a.type === required);
            if (!found) {
                verdict.checks.push({
                    name: 'required_artifact',
                    artifact: required,
                    found: false,
                    passed: false
                });
                verdict.reasons.push(`Missing required artifact: ${required}`);
                verdict.status = 'fail';
            }
        }
    }

    // Check 3: Lint results (if code task)
    if (taskType === 'code' || taskType === 'code_update') {
        const lintArtifact = artifactList.find(a => a.type === 'code:lint');
        if (lintArtifact && profile.lint_clean !== false) {
            if (lintArtifact.errors > 0) {
                verdict.checks.push({
                    name: 'lint_clean',
                    errors: lintArtifact.errors,
                    passed: false
                });
                verdict.reasons.push(`Lint errors found: ${lintArtifact.errors}`);
                verdict.status = 'fail';
            }
        }
    }

    // Check 4: Test results (if tests required)
    if (profile.tests_pass) {
        const testArtifact = artifactList.find(a => a.type === 'code:tests');
        if (testArtifact) {
            if (testArtifact.failed > 0) {
                verdict.checks.push({
                    name: 'tests_pass',
                    failed: testArtifact.failed,
                    passed: false
                });
                verdict.reasons.push(`Test failures: ${testArtifact.failed}`);
                verdict.status = 'fail';
            }
        } else if (profile.tests_required) {
            verdict.reasons.push('No test results found');
            verdict.status = 'fail';
        }
    }

    // Check 5: Coverage minimum (if specified)
    if (profile.coverage_min) {
        const coverageArtifact = artifactList.find(a => a.type === 'code:coverage');
        if (coverageArtifact) {
            const coverage = coverageArtifact.percentage || 0;
            if (coverage < profile.coverage_min) {
                verdict.checks.push({
                    name: 'coverage_min',
                    minimum: profile.coverage_min,
                    actual: coverage,
                    passed: false
                });
                verdict.reasons.push(`Coverage ${coverage}% below minimum ${profile.coverage_min}%`);
                verdict.status = 'fail';
            }
        }
    }

    // Check 6: Word count minimum (for content tasks)
    if (taskType === 'content' && commitment.commitments?.quality?.word_min) {
        const wordMin = commitment.commitments.quality.word_min;
        const contentArtifact = artifactList.find(a => a.type === 'content:scan');

        if (contentArtifact && contentArtifact.files) {
            for (const file of contentArtifact.files) {
                if (file.word_count < wordMin) {
                    verdict.checks.push({
                        name: 'word_min',
                        file: file.name,
                        minimum: wordMin,
                        actual: file.word_count,
                        passed: false
                    });
                    verdict.reasons.push(`${file.name}: word count ${file.word_count} < ${wordMin}`);
                    verdict.status = 'fail';
                }
            }
        }
    }

    // Check 7: Link checking (for link_check tasks)
    if (taskType === 'link_check') {
        const linkArtifact = artifactList.find(a => a.type === 'links:check');
        if (linkArtifact) {
            const failureThreshold = profile.link_failure_threshold || 0;
            const failureRate = linkArtifact.failed_count / linkArtifact.total_count;

            if (failureRate > failureThreshold) {
                verdict.checks.push({
                    name: 'link_failure_rate',
                    threshold: failureThreshold,
                    actual: failureRate,
                    passed: false
                });
                verdict.reasons.push(`Link failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold`);
                verdict.status = 'fail';
            }
        }
    }

    // If no failures found and we ran checks, mark as pass
    if (verdict.status === 'inconclusive' && verdict.checks.length > 0) {
        const allPassed = verdict.checks.every(c => c.passed !== false);
        if (allPassed) {
            verdict.status = 'pass';
        }
    }

    // Output verdict
    console.log(JSON.stringify(verdict, null, 2));

    // Exit with appropriate code unless dry-run
    if (!dryRun) {
        if (verdict.status === 'fail') {
            process.exit(1);
        }
    }
}

// Main execution
const args = process.argv.slice(2);
const artifactsPath = args[0];
const profilesPath = args[1];
const dryRun = args.includes('--dry-run');

if (!artifactsPath) {
    console.error('Usage: node enforce-gate.mjs <artifacts.json> [profiles.json] [--dry-run]');
    process.exit(1);
}

enforceGate(artifactsPath, profilesPath, dryRun).catch(error => {
    console.error('ERROR:', error.message);
    process.exit(1);
});