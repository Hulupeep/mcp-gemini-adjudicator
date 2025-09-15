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

    // Check 8: API Schema Validation (for API tasks)
    if (taskType === 'api' || taskType === 'api_scrape') {
        // Try to load schema_result.json if it exists
        const schemaResultPath = artifactsPath.replace('artifacts.json', 'api/schema_result.json');
        try {
            const schemaResult = JSON.parse(await fs.readFile(schemaResultPath, 'utf8'));

            // Check if profile requires schema validation
            const requiresSchema = profile.schema_required || profile.api_scrape?.schema_required;

            if (requiresSchema) {
                verdict.checks.push({
                    name: 'api_schema_validation',
                    schema_id: schemaResult.schema_id,
                    endpoint: schemaResult.endpoint,
                    ok: schemaResult.ok,
                    errors: schemaResult.errors?.length || 0,
                    passed: schemaResult.ok
                });

                if (!schemaResult.ok) {
                    verdict.reasons.push(`API schema validation failed: ${schemaResult.errors?.length || 0} errors`);
                    if (schemaResult.errors && schemaResult.errors.length > 0) {
                        // Add first few errors for context
                        const errorSample = schemaResult.errors.slice(0, 3).join('; ');
                        verdict.reasons.push(`  Errors: ${errorSample}`);
                    }
                    verdict.status = 'fail';
                    verdict.gate_type = 'SCHEMA_MISMATCH';
                }
            }

            // Check latency budget if specified
            if (profile.api_scrape?.latency_budget_ms && schemaResult.response_time_ms) {
                if (schemaResult.response_time_ms > profile.api_scrape.latency_budget_ms) {
                    verdict.checks.push({
                        name: 'api_latency_budget',
                        budget_ms: profile.api_scrape.latency_budget_ms,
                        actual_ms: schemaResult.response_time_ms,
                        passed: false
                    });
                    verdict.reasons.push(`API response time ${schemaResult.response_time_ms}ms exceeds budget ${profile.api_scrape.latency_budget_ms}ms`);
                    verdict.status = 'fail';
                }
            }
        } catch (e) {
            // No schema_result.json or error reading it
            if (e.code !== 'ENOENT') {
                console.error('Warning: Error reading schema_result.json:', e.message);
            }

            // If schema is required but no results found, fail
            const requiresSchema = profile.schema_required || profile.api_scrape?.schema_required;
            if (requiresSchema) {
                verdict.checks.push({
                    name: 'api_schema_validation',
                    error: 'No schema validation results found',
                    passed: false
                });
                verdict.reasons.push('API schema validation required but no results found');
                verdict.status = 'fail';
            }
        }
    }

    // Check 9: Function/Endpoint mapping confidence (for code tasks)
    if (taskType === 'code' || taskType === 'code_update') {
        // Try to load function_map.json if it exists
        const functionMapPath = artifactsPath.replace('artifacts.json', 'function_map.json');
        try {
            const functionMap = JSON.parse(await fs.readFile(functionMapPath, 'utf8'));

            // Check if commitment specifies required functions/endpoints
            const requiredFunctions = commitment.requirements?.functions || [];
            const requiredEndpoints = commitment.requirements?.endpoints || [];
            const totalRequired = requiredFunctions.length + requiredEndpoints.length;

            // Also check if claim lists specific units that look like functions
            const claimedUnits = claim.claim?.units_list || [];
            const functionUnits = claimedUnits.filter(u =>
                u.startsWith('func:') ||
                u.startsWith('function:') ||
                u.startsWith('ep:') ||
                u.startsWith('endpoint:') ||
                u.includes('::') || // class methods
                u.includes('.') && !u.includes('/') // module functions
            );

            // Use the larger of commitment requirements or claimed function units
            const expectedCount = Math.max(totalRequired, functionUnits.length);

            if (expectedCount > 0) {
                // Count matched functions with certainty
                const matchedCertain = functionMap.matched?.filter(m => m.certainty === 'certain') || [];
                const matchedFuzzy = functionMap.matched?.filter(m => m.certainty === 'fuzzy') || [];
                const unmatched = functionMap.unmatched_claims || [];

                // Check if we have function_certainty_required setting
                const certaintyCriteria = profile.function_certainty_required ||
                                        functionMap.confidence_threshold ||
                                        'fuzzy'; // default to accepting fuzzy matches

                // Determine if we have enough matches based on certainty criteria
                let sufficientMatches = false;
                let actualMatched = 0;

                if (certaintyCriteria === 'certain') {
                    // Only certain matches count
                    actualMatched = matchedCertain.length;
                    sufficientMatches = matchedCertain.length >= expectedCount;
                } else {
                    // Both certain and fuzzy matches count
                    actualMatched = matchedCertain.length + matchedFuzzy.length;
                    sufficientMatches = actualMatched >= expectedCount;
                }

                if (!sufficientMatches) {
                    // DIFF_MISMATCH: Claimed functions not found in actual changes
                    verdict.checks.push({
                        name: 'function_mapping',
                        expected: expectedCount,
                        matched_certain: matchedCertain.length,
                        matched_fuzzy: matchedFuzzy.length,
                        unmatched: unmatched.length,
                        certainty_required: certaintyCriteria,
                        passed: false
                    });

                    // Build detailed failure message
                    let failureMsg = `DIFF_MISMATCH: Expected ${expectedCount} functions/endpoints, `;
                    if (certaintyCriteria === 'certain') {
                        failureMsg += `found only ${matchedCertain.length} with certainty`;
                    } else {
                        failureMsg += `found only ${actualMatched} total (${matchedCertain.length} certain, ${matchedFuzzy.length} fuzzy)`;
                    }

                    if (unmatched.length > 0) {
                        failureMsg += `. Missing: ${unmatched.join(', ')}`;
                    }

                    verdict.reasons.push(failureMsg);
                    verdict.status = 'fail';
                    verdict.gate_type = 'DIFF_MISMATCH'; // Mark specific gate type
                } else {
                    // All claimed functions found
                    verdict.checks.push({
                        name: 'function_mapping',
                        expected: expectedCount,
                        matched_certain: matchedCertain.length,
                        matched_fuzzy: matchedFuzzy.length,
                        certainty_required: certaintyCriteria,
                        passed: true
                    });
                }

                // Also check for unclaimed significant changes
                if (functionMap.unmatched_diffs && functionMap.unmatched_diffs.length > 0) {
                    const significantUnclaimed = functionMap.unmatched_diffs.filter(d => d.significant !== false);
                    if (significantUnclaimed.length > 0 && profile.reject_unclaimed_changes) {
                        verdict.checks.push({
                            name: 'unclaimed_changes',
                            count: significantUnclaimed.length,
                            files: [...new Set(significantUnclaimed.map(d => d.file))],
                            passed: false
                        });
                        verdict.reasons.push(`Found ${significantUnclaimed.length} unclaimed code changes`);
                        verdict.status = 'fail';
                    }
                }
            }
        } catch (e) {
            // No function_map.json or error reading it - not a failure, just skip this check
            if (e.code !== 'ENOENT') {
                console.error('Warning: Error reading function_map.json:', e.message);
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