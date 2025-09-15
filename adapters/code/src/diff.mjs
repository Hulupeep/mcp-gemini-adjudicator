#!/usr/bin/env node
/**
 * Diff Adapter - Analyzes code changes and modified files
 * Outputs: diff_names.json (file list) and diffs.patch (unified diff)
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

export async function runDiff(options) {
    const { taskDir, commitment, claim, profile } = options;

    const results = {
        files_modified: [],
        files_created: [],
        files_deleted: [],
        functions_modified: [],
        endpoints_modified: [],
        total_changes: 0
    };

    try {
        // Get git diff if in a git repo
        let diffOutput = '';
        let fileList = [];

        try {
            // Check if we're in a git repo
            execSync('git rev-parse --git-dir', { stdio: 'pipe' });

            // Get list of modified files
            const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
            const lines = statusOutput.split('\n').filter(line => line.trim());

            for (const line of lines) {
                const status = line.substring(0, 2).trim();
                const file = line.substring(3).trim();

                if (status === 'M' || status === 'MM') {
                    results.files_modified.push(file);
                    fileList.push(file);
                } else if (status === 'A' || status === '??') {
                    results.files_created.push(file);
                    fileList.push(file);
                } else if (status === 'D') {
                    results.files_deleted.push(file);
                }
            }

            // Get unified diff
            if (fileList.length > 0) {
                try {
                    diffOutput = execSync('git diff HEAD', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
                } catch (e) {
                    // Try diff for untracked files
                    diffOutput = execSync('git diff --no-index /dev/null ' + fileList.join(' '), { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).toString();
                }
            }

        } catch (gitError) {
            // Not a git repo or git not available
            // Fall back to claim data if available
            if (claim && claim.claimed && claim.claimed.files_modified) {
                fileList = claim.claimed.files_modified;
                results.files_modified = fileList;
            }
        }

        // Analyze diff for functions and endpoints
        if (diffOutput) {
            results.functions_modified = extractFunctions(diffOutput);
            results.endpoints_modified = extractEndpoints(diffOutput);
        }

        results.total_changes = results.files_modified.length +
                               results.files_created.length +
                               results.files_deleted.length;

        // Write outputs
        await fs.writeFile(
            join(taskDir, 'diff_names.json'),
            JSON.stringify(fileList, null, 2)
        );

        await fs.writeFile(
            join(taskDir, 'diffs.patch'),
            diffOutput || '# No diff available\n'
        );

        await fs.writeFile(
            join(taskDir, 'diff.json'),
            JSON.stringify(results, null, 2)
        );

        return results;

    } catch (error) {
        console.error('Error in diff adapter:', error);

        // Write error state
        await fs.writeFile(
            join(taskDir, 'diff.json'),
            JSON.stringify({
                error: error.message,
                ...results
            }, null, 2)
        );

        return results;
    }
}

function extractFunctions(diff) {
    const functions = [];
    const patterns = [
        /^\+\s*(async\s+)?function\s+(\w+)/gm,
        /^\+\s*const\s+(\w+)\s*=\s*(async\s+)?function/gm,
        /^\+\s*const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/gm,
        /^\+\s*export\s+(async\s+)?function\s+(\w+)/gm,
        /^\+\s*class\s+(\w+)/gm,
        /^\+\s*(\w+)\s*\([^)]*\)\s*{/gm  // Method definitions
    ];

    for (const pattern of patterns) {
        const matches = [...diff.matchAll(pattern)];
        for (const match of matches) {
            const funcName = match[2] || match[1];
            if (funcName && !functions.includes(funcName)) {
                functions.push(funcName);
            }
        }
    }

    return functions;
}

function extractEndpoints(diff) {
    const endpoints = [];
    const patterns = [
        /^\+\s*app\.(get|post|put|delete|patch)\s*\(['"`]([^'"`]+)/gm,
        /^\+\s*router\.(get|post|put|delete|patch)\s*\(['"`]([^'"`]+)/gm,
        /^\+\s*@(Get|Post|Put|Delete|Patch)\s*\(['"`]([^'"`]+)/gm,  // Decorators
        /^\+\s*route\s*:\s*['"`]([^'"`]+)/gm  // Route definitions
    ];

    for (const pattern of patterns) {
        const matches = [...diff.matchAll(pattern)];
        for (const match of matches) {
            const endpoint = match[2] || match[1];
            if (endpoint && !endpoints.includes(endpoint)) {
                endpoints.push(endpoint);
            }
        }
    }

    return endpoints;
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

    await runDiff(options);
}