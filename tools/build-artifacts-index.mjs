#!/usr/bin/env node
/**
 * Build Artifacts Index
 * Creates an index of all artifacts in a task directory
 */

import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

async function buildIndex(taskDir) {
    const artifacts = {
        task_dir: taskDir,
        timestamp: new Date().toISOString(),
        files: [],
        checksums: {},
        summary: {
            diff: null,
            lint: null,
            tests: null,
            coverage: null
        }
    };

    try {
        // Walk the task directory
        const files = await walkDirectory(taskDir);

        for (const file of files) {
            const relativePath = relative(taskDir, file);
            const stat = await fs.stat(file);
            const content = await fs.readFile(file);
            const checksum = createHash('sha256').update(content).digest('hex');

            artifacts.files.push({
                path: relativePath,
                size: stat.size,
                modified: stat.mtime.toISOString(),
                checksum: checksum
            });

            artifacts.checksums[relativePath] = checksum;

            // Parse summary for known files
            if (relativePath === 'diff.json') {
                try {
                    artifacts.summary.diff = JSON.parse(content);
                } catch {}
            } else if (relativePath === 'lint.json') {
                try {
                    artifacts.summary.lint = JSON.parse(content);
                } catch {}
            } else if (relativePath === 'tests.json') {
                try {
                    artifacts.summary.tests = JSON.parse(content);
                } catch {}
            } else if (relativePath === 'coverage.json') {
                try {
                    artifacts.summary.coverage = JSON.parse(content);
                } catch {}
            }
        }

        // Add overall metrics
        artifacts.metrics = {
            total_files: artifacts.files.length,
            has_diff: artifacts.summary.diff !== null,
            has_lint: artifacts.summary.lint !== null,
            has_tests: artifacts.summary.tests !== null,
            has_coverage: artifacts.summary.coverage !== null,
            lint_passed: artifacts.summary.lint ? artifacts.summary.lint.exitCode === 0 : null,
            tests_passed: artifacts.summary.tests ?
                artifacts.summary.tests.failed === 0 && artifacts.summary.tests.total > 0 : null,
            coverage_pct: artifacts.summary.coverage ? artifacts.summary.coverage.pct : null
        };

        return artifacts;

    } catch (error) {
        console.error('Error building artifacts index:', error);
        artifacts.error = error.message;
        return artifacts;
    }
}

async function walkDirectory(dir, files = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            await walkDirectory(fullPath, files);
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const taskDir = process.argv[2] || '.artifacts/current';

    try {
        const artifacts = await buildIndex(taskDir);
        console.log(JSON.stringify(artifacts, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}