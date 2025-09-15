#!/usr/bin/env node
/**
 * Lint Adapter - Runs code quality checks
 * Outputs: lint.json with exitCode and summary
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export async function runLint(options) {
    const { taskDir, commitment, claim, profile } = options;

    const results = {
        exitCode: 0,
        summary: '',
        errors: 0,
        warnings: 0,
        files_checked: 0,
        issues: []
    };

    try {
        // Detect available linters
        const linters = detectLinters();

        if (linters.length === 0) {
            results.summary = 'No linters found in project';
            results.exitCode = 0; // Don't fail if no linter configured
        } else {
            // Run each detected linter
            for (const linter of linters) {
                const lintResult = await runLinter(linter);

                // Aggregate results
                results.exitCode = Math.max(results.exitCode, lintResult.exitCode);
                results.errors += lintResult.errors;
                results.warnings += lintResult.warnings;
                results.files_checked += lintResult.files_checked;
                results.issues.push(...lintResult.issues);
            }

            results.summary = `Checked ${results.files_checked} files: ${results.errors} errors, ${results.warnings} warnings`;
        }

        // Write output
        await fs.writeFile(
            join(taskDir, 'lint.json'),
            JSON.stringify(results, null, 2)
        );

        return results;

    } catch (error) {
        console.error('Error in lint adapter:', error);

        results.exitCode = 1;
        results.summary = `Lint check failed: ${error.message}`;

        await fs.writeFile(
            join(taskDir, 'lint.json'),
            JSON.stringify(results, null, 2)
        );

        return results;
    }
}

function detectLinters() {
    const linters = [];

    // Check for ESLint (JavaScript/TypeScript)
    try {
        execSync('which eslint', { stdio: 'pipe' });
        linters.push({ name: 'eslint', command: 'eslint', type: 'js' });
    } catch {}

    // Check for npm run lint
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (packageJson.scripts && packageJson.scripts.lint) {
            linters.push({ name: 'npm-lint', command: 'npm run lint', type: 'npm' });
        }
    } catch {}

    // Check for Pylint (Python)
    try {
        execSync('which pylint', { stdio: 'pipe' });
        linters.push({ name: 'pylint', command: 'pylint', type: 'python' });
    } catch {}

    // Check for Ruff (Python)
    try {
        execSync('which ruff', { stdio: 'pipe' });
        linters.push({ name: 'ruff', command: 'ruff check', type: 'python' });
    } catch {}

    // Check for RuboCop (Ruby)
    try {
        execSync('which rubocop', { stdio: 'pipe' });
        linters.push({ name: 'rubocop', command: 'rubocop', type: 'ruby' });
    } catch {}

    // Check for golangci-lint (Go)
    try {
        execSync('which golangci-lint', { stdio: 'pipe' });
        linters.push({ name: 'golangci-lint', command: 'golangci-lint run', type: 'go' });
    } catch {}

    return linters;
}

async function runLinter(linter) {
    const result = {
        exitCode: 0,
        errors: 0,
        warnings: 0,
        files_checked: 0,
        issues: []
    };

    try {
        let output = '';

        // Run linter with appropriate flags
        if (linter.name === 'eslint') {
            try {
                output = execSync('eslint . --format json', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
                const eslintResults = JSON.parse(output);

                for (const file of eslintResults) {
                    result.files_checked++;
                    result.errors += file.errorCount;
                    result.warnings += file.warningCount;

                    for (const message of file.messages) {
                        result.issues.push({
                            file: file.filePath,
                            line: message.line,
                            column: message.column,
                            severity: message.severity === 2 ? 'error' : 'warning',
                            message: message.message,
                            rule: message.ruleId
                        });
                    }
                }
            } catch (e) {
                if (e.stdout) {
                    // ESLint returns non-zero exit code when issues found
                    output = e.stdout.toString();
                    try {
                        const eslintResults = JSON.parse(output);
                        for (const file of eslintResults) {
                            result.files_checked++;
                            result.errors += file.errorCount;
                            result.warnings += file.warningCount;
                        }
                    } catch {}
                }
                result.exitCode = e.status || 1;
            }
        } else if (linter.name === 'npm-lint') {
            try {
                output = execSync('npm run lint', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
                // Parse output for common patterns
                const errorMatches = output.match(/(\d+)\s+error/gi);
                const warningMatches = output.match(/(\d+)\s+warning/gi);

                if (errorMatches) {
                    result.errors = parseInt(errorMatches[0].match(/\d+/)[0]);
                }
                if (warningMatches) {
                    result.warnings = parseInt(warningMatches[0].match(/\d+/)[0]);
                }
            } catch (e) {
                result.exitCode = e.status || 1;
                output = e.stdout ? e.stdout.toString() : '';

                // Try to parse errors from output
                const errorMatches = output.match(/(\d+)\s+error/gi);
                const warningMatches = output.match(/(\d+)\s+warning/gi);

                if (errorMatches) {
                    result.errors = parseInt(errorMatches[0].match(/\d+/)[0]);
                }
                if (warningMatches) {
                    result.warnings = parseInt(warningMatches[0].match(/\d+/)[0]);
                }
            }
        } else if (linter.name === 'ruff') {
            try {
                output = execSync('ruff check . --output-format json', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            } catch (e) {
                if (e.stdout) {
                    output = e.stdout.toString();
                    try {
                        const ruffResults = JSON.parse(output);
                        result.errors = ruffResults.length;
                        result.files_checked = new Set(ruffResults.map(r => r.filename)).size;
                    } catch {}
                }
                result.exitCode = e.status || 1;
            }
        } else {
            // Generic linter execution
            try {
                output = execSync(linter.command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            } catch (e) {
                result.exitCode = e.status || 1;
                output = e.stdout ? e.stdout.toString() : '';
            }
        }

        // Store raw output for debugging
        result.raw_output = output.substring(0, 5000); // Limit size

    } catch (error) {
        console.error(`Error running ${linter.name}:`, error.message);
        result.exitCode = 1;
    }

    return result;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {
        taskDir: '.artifacts/current',
        commitment: {},
        claim: {},
        profile: {}
    };

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--task-dir' && args[i + 1]) {
            options.taskDir = args[i + 1];
            i++;
        } else if (args[i] === '--commitment' && args[i + 1]) {
            options.commitment = JSON.parse(await fs.readFile(args[i + 1], 'utf8'));
            i++;
        } else if (args[i] === '--claim' && args[i + 1]) {
            options.claim = JSON.parse(await fs.readFile(args[i + 1], 'utf8'));
            i++;
        } else if (args[i] === '--profile' && args[i + 1]) {
            options.profile = JSON.parse(await fs.readFile(args[i + 1], 'utf8'));
            i++;
        }
    }

    await runLint(options);
}