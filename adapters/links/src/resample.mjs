#!/usr/bin/env node
/**
 * Link Resampling Module
 * Retries failed links with exponential backoff
 */

import { promises as fs } from 'fs';
import { join } from 'path';

export async function resampleLinks(options) {
    const { taskDir, commitment, claim, profile } = options;

    const results = {
        total_resampled: 0,
        recovered: 0,
        still_failed: 0,
        resample_attempts: [],
        final_statuses: {},
        timestamp: new Date().toISOString()
    };

    try {
        const linksDir = join(taskDir, 'links');

        // Load current statuses
        let statuses = {};
        try {
            const statusPath = join(linksDir, 'statuses.json');
            statuses = JSON.parse(await fs.readFile(statusPath, 'utf8'));
        } catch (error) {
            console.error('No statuses.json found, nothing to resample');
            await fs.writeFile(
                join(linksDir, 'resample.json'),
                JSON.stringify(results, null, 2)
            );
            return results;
        }

        // Get profile settings
        const profileName = commitment?.profile || 'link_check';
        const profileSettings = profile[profileName] || profile.link_check || {};
        const maxAttempts = profileSettings.resample_failures || 3;
        const timeout = profileSettings.timeout_ms || 5000;
        const treat3xxAsPass = profileSettings.treat_3xx_as_pass !== false;

        // Find failed URLs
        const failedUrls = [];
        for (const [url, status] of Object.entries(statuses)) {
            if (status >= 400 || status === 'timeout' || status === 'error') {
                failedUrls.push(url);
            } else if (status >= 300 && status < 400 && !treat3xxAsPass) {
                failedUrls.push(url);
            }
        }

        if (failedUrls.length === 0) {
            console.log('No failed URLs to resample');
            results.final_statuses = statuses;
            await fs.writeFile(
                join(linksDir, 'resample.json'),
                JSON.stringify(results, null, 2)
            );
            return results;
        }

        console.log(`Resampling ${failedUrls.length} failed URLs (max ${maxAttempts} attempts each)`);

        // Resample each failed URL
        for (const url of failedUrls) {
            const attemptResults = [];
            let finalStatus = statuses[url];
            let recovered = false;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                // Exponential backoff: 1s, 2s, 4s, 8s...
                const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await sleep(backoffMs);

                const status = await checkUrlWithRetry(url, timeout);
                attemptResults.push({
                    attempt: attempt,
                    status: status,
                    timestamp: new Date().toISOString()
                });

                if (isSuccessStatus(status, treat3xxAsPass)) {
                    finalStatus = status;
                    recovered = true;
                    results.recovered++;
                    console.log(`  ✓ ${url} recovered on attempt ${attempt}: ${status}`);
                    break;
                } else {
                    console.log(`  ✗ ${url} attempt ${attempt}: ${status}`);
                }
            }

            if (!recovered) {
                results.still_failed++;
            }

            results.total_resampled++;
            results.resample_attempts.push({
                url: url,
                original_status: statuses[url],
                final_status: finalStatus,
                recovered: recovered,
                attempts: attemptResults
            });

            // Update final status
            results.final_statuses[url] = finalStatus;
            statuses[url] = finalStatus;
        }

        // Copy non-failed URLs to final statuses
        for (const [url, status] of Object.entries(statuses)) {
            if (!failedUrls.includes(url)) {
                results.final_statuses[url] = status;
            }
        }

        // Write updated statuses
        await fs.writeFile(
            join(linksDir, 'statuses.json'),
            JSON.stringify(results.final_statuses, null, 2)
        );

        // Write resample report
        await fs.writeFile(
            join(linksDir, 'resample.json'),
            JSON.stringify(results, null, 2)
        );

        console.log(`Resample complete: ${results.recovered} recovered, ${results.still_failed} still failed`);

        return results;

    } catch (error) {
        console.error('Error in link resampling:', error);
        results.error = error.message;

        const linksDir = join(taskDir, 'links');
        await fs.writeFile(
            join(linksDir, 'resample.json'),
            JSON.stringify(results, null, 2)
        );

        return results;
    }
}

async function checkUrlWithRetry(url, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        // Try HEAD first
        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'manual',
            headers: {
                'User-Agent': 'MCP-Gemini-Adjudicator/1.0 (Link Checker - Resample)',
                'Cache-Control': 'no-cache'
            }
        });

        clearTimeout(timeoutId);
        return response.status;

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            return 'timeout';
        }

        // Try GET if HEAD fails
        try {
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), timeout);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller2.signal,
                redirect: 'manual',
                headers: {
                    'User-Agent': 'MCP-Gemini-Adjudicator/1.0 (Link Checker - Resample)',
                    'Cache-Control': 'no-cache'
                }
            });

            clearTimeout(timeoutId2);
            return response.status;

        } catch (error2) {
            if (error2.name === 'AbortError') {
                return 'timeout';
            }
            return 'error';
        }
    }
}

function isSuccessStatus(status, treat3xxAsPass) {
    if (typeof status === 'number') {
        if (status >= 200 && status < 300) return true;
        if (status >= 300 && status < 400 && treat3xxAsPass) return true;
    }
    return false;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    await resampleLinks(options);
}