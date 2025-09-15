#!/usr/bin/env node
/**
 * Coverage Adapter - Generates code coverage metrics
 * Outputs: coverage.json with percentage and report path
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export async function runCoverage(options) {
    const { taskDir, commitment, claim, profile } = options;

    const results = {
        pct: 0,
        lines: { pct: 0, covered: 0, total: 0 },
        branches: { pct: 0, covered: 0, total: 0 },
        functions: { pct: 0, covered: 0, total: 0 },
        statements: { pct: 0, covered: 0, total: 0 },
        report_path: '',
        framework: ''
    };

    try {
        // Detect coverage tool
        const coverageTool = detectCoverageTool();

        if (!coverageTool) {
            results.summary = 'No coverage tool detected';
            results.pct = 0;
        } else {
            results.framework = coverageTool.framework;

            // Run coverage
            const coverageResult = await executeCoverage(coverageTool);

            // Copy results
            Object.assign(results, coverageResult);
        }

        // Write output
        await fs.writeFile(
            join(taskDir, 'coverage.json'),
            JSON.stringify(results, null, 2)
        );

        return results;

    } catch (error) {
        console.error('Error in coverage adapter:', error);

        results.summary = `Coverage check failed: ${error.message}`;

        await fs.writeFile(
            join(taskDir, 'coverage.json'),
            JSON.stringify(results, null, 2)
        );

        return results;
    }
}

function detectCoverageTool() {
    // Check for npm coverage script
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (packageJson.scripts && packageJson.scripts.coverage) {
            return {
                framework: 'npm-coverage',
                command: 'npm run coverage',
                parser: 'auto'
            };
        }
        // Check for test:coverage script
        if (packageJson.scripts && packageJson.scripts['test:coverage']) {
            return {
                framework: 'npm-coverage',
                command: 'npm run test:coverage',
                parser: 'auto'
            };
        }
    } catch {}

    // Check for Jest with coverage
    try {
        execSync('which jest', { stdio: 'pipe' });
        return {
            framework: 'jest',
            command: 'jest --coverage --coverageReporters=json',
            parser: 'jest'
        };
    } catch {}

    // Check for nyc (Node.js coverage)
    try {
        execSync('which nyc', { stdio: 'pipe' });
        return {
            framework: 'nyc',
            command: 'nyc --reporter=json npm test',
            parser: 'nyc'
        };
    } catch {}

    // Check for coverage.py (Python)
    try {
        execSync('which coverage', { stdio: 'pipe' });
        return {
            framework: 'coverage.py',
            command: 'coverage run -m pytest && coverage json',
            parser: 'coverage.py'
        };
    } catch {}

    // Check for go test coverage
    try {
        execSync('which go', { stdio: 'pipe' });
        if (fs.existsSync('go.mod')) {
            return {
                framework: 'go',
                command: 'go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out',
                parser: 'go'
            };
        }
    } catch {}

    // Check for cargo tarpaulin (Rust)
    try {
        execSync('which cargo-tarpaulin', { stdio: 'pipe' });
        if (fs.existsSync('Cargo.toml')) {
            return {
                framework: 'tarpaulin',
                command: 'cargo tarpaulin --out Json',
                parser: 'tarpaulin'
            };
        }
    } catch {}

    return null;
}

async function executeCoverage(coverageTool) {
    const result = {
        pct: 0,
        lines: { pct: 0, covered: 0, total: 0 },
        branches: { pct: 0, covered: 0, total: 0 },
        functions: { pct: 0, covered: 0, total: 0 },
        statements: { pct: 0, covered: 0, total: 0 },
        report_path: ''
    };

    try {
        let output = '';

        // Run coverage
        try {
            output = execSync(coverageTool.command, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                timeout: 120000 // 2 minute timeout for coverage
            });
        } catch (e) {
            // Coverage commands may return non-zero on low coverage
            output = e.stdout ? e.stdout.toString() : '';
        }

        // Parse based on framework
        if (coverageTool.parser === 'jest') {
            // Look for coverage-summary.json
            try {
                const coveragePath = 'coverage/coverage-summary.json';
                if (fs.existsSync(coveragePath)) {
                    const summary = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                    const total = summary.total;

                    result.lines = {
                        pct: total.lines.pct,
                        covered: total.lines.covered,
                        total: total.lines.total
                    };
                    result.branches = {
                        pct: total.branches.pct,
                        covered: total.branches.covered,
                        total: total.branches.total
                    };
                    result.functions = {
                        pct: total.functions.pct,
                        covered: total.functions.covered,
                        total: total.functions.total
                    };
                    result.statements = {
                        pct: total.statements.pct,
                        covered: total.statements.covered,
                        total: total.statements.total
                    };

                    // Overall percentage (average of all metrics)
                    result.pct = (total.lines.pct + total.branches.pct +
                                 total.functions.pct + total.statements.pct) / 4;
                    result.pct = Math.round(result.pct * 100) / 100;

                    result.report_path = coveragePath;
                }
            } catch (parseError) {
                console.error('Error parsing Jest coverage:', parseError);
            }
        } else if (coverageTool.parser === 'nyc') {
            // Look for nyc output
            try {
                const coveragePath = 'coverage/coverage-summary.json';
                if (fs.existsSync(coveragePath)) {
                    const summary = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
                    const total = summary.total;

                    result.lines = {
                        pct: total.lines.pct,
                        covered: total.lines.covered,
                        total: total.lines.total
                    };
                    result.branches = {
                        pct: total.branches.pct,
                        covered: total.branches.covered,
                        total: total.branches.total
                    };
                    result.functions = {
                        pct: total.functions.pct,
                        covered: total.functions.covered,
                        total: total.functions.total
                    };
                    result.statements = {
                        pct: total.statements.pct,
                        covered: total.statements.covered,
                        total: total.statements.total
                    };

                    result.pct = total.lines.pct;
                    result.report_path = coveragePath;
                }
            } catch (parseError) {
                // Fall back to parsing text output
                const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)/);
                if (coverageMatch) {
                    result.pct = parseFloat(coverageMatch[1]);
                }
            }
        } else if (coverageTool.parser === 'coverage.py') {
            // Look for coverage.json
            try {
                if (fs.existsSync('coverage.json')) {
                    const coverageData = JSON.parse(fs.readFileSync('coverage.json', 'utf8'));
                    const totals = coverageData.totals;

                    const covered = totals.covered_lines || 0;
                    const total = totals.num_statements || 1;
                    result.pct = (covered / total) * 100;
                    result.pct = Math.round(result.pct * 100) / 100;

                    result.lines = {
                        pct: result.pct,
                        covered: covered,
                        total: total
                    };

                    result.report_path = 'coverage.json';
                }
            } catch (parseError) {
                // Fall back to parsing text output
                const coverageMatch = output.match(/TOTAL\s+\d+\s+\d+\s+([\d.]+)%/);
                if (coverageMatch) {
                    result.pct = parseFloat(coverageMatch[1]);
                }
            }
        } else if (coverageTool.parser === 'go') {
            // Parse go coverage output
            const coverageMatch = output.match(/total:\s+\(statements\)\s+([\d.]+)%/);
            if (coverageMatch) {
                result.pct = parseFloat(coverageMatch[1]);
            } else {
                // Alternative format
                const lines = output.split('\n');
                let totalStatements = 0;
                let coveredStatements = 0;

                for (const line of lines) {
                    const match = line.match(/\s+([\d.]+)%/);
                    if (match) {
                        // Simple average of all percentages
                        result.pct += parseFloat(match[1]);
                        totalStatements++;
                    }
                }

                if (totalStatements > 0) {
                    result.pct = result.pct / totalStatements;
                }
            }

            result.report_path = 'coverage.out';
        } else {
            // Generic parsing for npm coverage or other commands
            const patterns = [
                /All files\s+\|\s+([\d.]+)/,  // Istanbul/nyc format
                /Lines\s+:\s+([\d.]+)%/,       // Common format
                /Coverage:\s+([\d.]+)%/,       // Generic
                /Total Coverage:\s+([\d.]+)%/, // Alternative
                /Statement\s+:\s+([\d.]+)%/    // Statement coverage
            ];

            for (const pattern of patterns) {
                const match = output.match(pattern);
                if (match) {
                    result.pct = parseFloat(match[1]);
                    break;
                }
            }
        }

        // Normalize percentage to 0-1 range if needed
        if (result.pct > 1) {
            result.pct = result.pct / 100;
        }

        // Store sample output for debugging
        result.raw_output = output.substring(0, 5000);

    } catch (error) {
        console.error('Error executing coverage:', error);
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

    await runCoverage(options);
}