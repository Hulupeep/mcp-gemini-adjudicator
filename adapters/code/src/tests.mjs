#!/usr/bin/env node
/**
 * Tests Adapter - Executes test suite and reports results
 * Outputs: tests.json with passed/total counts
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export async function runTests(options) {
    const { taskDir, commitment, claim, profile } = options;

    const results = {
        passed: 0,
        failed: 0,
        total: 0,
        skipped: 0,
        duration: 0,
        test_command: '',
        test_framework: '',
        details: []
    };

    const startTime = Date.now();

    try {
        // Detect test framework
        const testCommand = detectTestFramework();

        if (!testCommand) {
            results.summary = 'No test framework detected';
            results.total = 0;
        } else {
            results.test_command = testCommand.command;
            results.test_framework = testCommand.framework;

            // Run tests
            const testResult = await executeTests(testCommand);

            // Copy results
            Object.assign(results, testResult);
        }

        results.duration = Date.now() - startTime;

        // Write output
        await fs.writeFile(
            join(taskDir, 'tests.json'),
            JSON.stringify(results, null, 2)
        );

        return results;

    } catch (error) {
        console.error('Error in tests adapter:', error);

        results.duration = Date.now() - startTime;
        results.summary = `Test execution failed: ${error.message}`;

        await fs.writeFile(
            join(taskDir, 'tests.json'),
            JSON.stringify(results, null, 2)
        );

        return results;
    }
}

function detectTestFramework() {
    // Check package.json for test script
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (packageJson.scripts && packageJson.scripts.test) {
            return {
                framework: 'npm',
                command: 'npm test',
                parser: 'auto'
            };
        }
    } catch {}

    // Check for Jest
    try {
        execSync('which jest', { stdio: 'pipe' });
        return {
            framework: 'jest',
            command: 'jest --json',
            parser: 'jest'
        };
    } catch {}

    // Check for Mocha
    try {
        execSync('which mocha', { stdio: 'pipe' });
        return {
            framework: 'mocha',
            command: 'mocha --reporter json',
            parser: 'mocha'
        };
    } catch {}

    // Check for pytest
    try {
        execSync('which pytest', { stdio: 'pipe' });
        return {
            framework: 'pytest',
            command: 'pytest --json-report --json-report-file=/tmp/pytest.json',
            parser: 'pytest'
        };
    } catch {}

    // Check for go test
    try {
        execSync('which go', { stdio: 'pipe' });
        if (fs.existsSync('go.mod')) {
            return {
                framework: 'go',
                command: 'go test -json ./...',
                parser: 'go'
            };
        }
    } catch {}

    // Check for cargo test (Rust)
    try {
        execSync('which cargo', { stdio: 'pipe' });
        if (fs.existsSync('Cargo.toml')) {
            return {
                framework: 'cargo',
                command: 'cargo test',
                parser: 'cargo'
            };
        }
    } catch {}

    return null;
}

async function executeTests(testCommand) {
    const result = {
        passed: 0,
        failed: 0,
        total: 0,
        skipped: 0,
        details: []
    };

    try {
        let output = '';

        // Run tests
        try {
            output = execSync(testCommand.command, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                timeout: 60000 // 60 second timeout
            });
        } catch (e) {
            // Tests may return non-zero exit code on failure
            output = e.stdout ? e.stdout.toString() : '';

            // For JSON reporters, still try to parse
            if (testCommand.parser === 'jest' || testCommand.parser === 'mocha') {
                // Continue to parse
            } else {
                // For other frameworks, extract what we can
                result.failed = 1; // At least one failure
            }
        }

        // Parse based on framework
        if (testCommand.parser === 'jest' && output) {
            try {
                const jestResult = JSON.parse(output);
                result.passed = jestResult.numPassedTests || 0;
                result.failed = jestResult.numFailedTests || 0;
                result.total = jestResult.numTotalTests || 0;
                result.skipped = jestResult.numPendingTests || 0;

                // Extract test details
                if (jestResult.testResults) {
                    for (const testFile of jestResult.testResults) {
                        for (const test of testFile.assertionResults || []) {
                            result.details.push({
                                name: test.fullName || test.title,
                                status: test.status,
                                duration: test.duration,
                                file: testFile.name
                            });
                        }
                    }
                }
            } catch (parseError) {
                console.error('Error parsing Jest output:', parseError);
            }
        } else if (testCommand.parser === 'mocha' && output) {
            try {
                const mochaResult = JSON.parse(output);
                result.passed = mochaResult.stats.passes || 0;
                result.failed = mochaResult.stats.failures || 0;
                result.total = mochaResult.stats.tests || 0;
                result.skipped = mochaResult.stats.pending || 0;
            } catch (parseError) {
                console.error('Error parsing Mocha output:', parseError);
            }
        } else if (testCommand.parser === 'pytest') {
            // Read pytest JSON report
            try {
                const pytestReport = JSON.parse(fs.readFileSync('/tmp/pytest.json', 'utf8'));
                result.passed = pytestReport.summary.passed || 0;
                result.failed = pytestReport.summary.failed || 0;
                result.total = pytestReport.summary.total || 0;
                result.skipped = pytestReport.summary.skipped || 0;
            } catch (parseError) {
                // Fall back to parsing text output
                const passMatch = output.match(/(\d+) passed/);
                const failMatch = output.match(/(\d+) failed/);

                if (passMatch) result.passed = parseInt(passMatch[1]);
                if (failMatch) result.failed = parseInt(failMatch[1]);
                result.total = result.passed + result.failed;
            }
        } else if (testCommand.parser === 'go' && output) {
            // Parse Go test JSON output
            const lines = output.split('\n').filter(line => line.trim());
            for (const line of lines) {
                try {
                    const event = JSON.parse(line);
                    if (event.Action === 'pass') {
                        result.passed++;
                    } else if (event.Action === 'fail') {
                        result.failed++;
                    } else if (event.Action === 'skip') {
                        result.skipped++;
                    }
                } catch {}
            }
            result.total = result.passed + result.failed + result.skipped;
        } else {
            // Generic parsing for npm test or other commands
            const passPatterns = [
                /(\d+)\s+pass(?:ing|ed)?/i,
                /✓\s+(\d+)/,
                /(\d+)\s+test(?:s)?\s+pass(?:ed)?/i
            ];

            const failPatterns = [
                /(\d+)\s+fail(?:ing|ed)?/i,
                /✗\s+(\d+)/,
                /(\d+)\s+test(?:s)?\s+fail(?:ed)?/i
            ];

            for (const pattern of passPatterns) {
                const match = output.match(pattern);
                if (match) {
                    result.passed = parseInt(match[1]);
                    break;
                }
            }

            for (const pattern of failPatterns) {
                const match = output.match(pattern);
                if (match) {
                    result.failed = parseInt(match[1]);
                    break;
                }
            }

            result.total = result.passed + result.failed;
        }

        // Store sample output for debugging
        result.raw_output = output.substring(0, 5000);

    } catch (error) {
        console.error('Error executing tests:', error);
        result.error = error.message;
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

    await runTests(options);
}