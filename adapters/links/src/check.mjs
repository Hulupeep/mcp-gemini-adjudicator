#!/usr/bin/env node
/**
 * Link Checking Module
 * Checks HTTP status of discovered links
 */

import { promises as fs } from 'fs';
import { join } from 'path';

export async function checkLinks(options) {
    const { taskDir, commitment, claim, profile } = options;

    const results = {
        total_checked: 0,
        passed: 0,
        failed: 0,
        statuses: {},
        summary: {
            '2xx': 0,
            '3xx': 0,
            '4xx': 0,
            '5xx': 0,
            'timeout': 0,
            'error': 0
        },
        timestamp: new Date().toISOString()
    };

    try {
        const linksDir = join(taskDir, 'links');

        // Load urlset
        let urls = [];
        try {
            const urlsetPath = join(linksDir, 'urlset.json');
            urls = JSON.parse(await fs.readFile(urlsetPath, 'utf8'));
        } catch (error) {
            console.error('No urlset.json found, nothing to check');
            await fs.writeFile(
                join(linksDir, 'statuses.json'),
                JSON.stringify(results.statuses, null, 2)
            );
            return results;
        }

        // Get profile settings
        const profileName = commitment?.profile || 'link_check';
        const profileSettings = profile[profileName] || profile.link_check || {};
        const timeout = profileSettings.timeout_ms || 5000;
        const concurrent = profileSettings.concurrent_checks || 5;
        const rateLimit = profileSettings.rate_limit_ms || 100;
        const treat3xxAsPass = profileSettings.treat_3xx_as_pass !== false;

        console.log(`Checking ${urls.length} URLs with profile: ${profileName}`);

        // Check URLs in batches to respect concurrency limits
        for (let i = 0; i < urls.length; i += concurrent) {
            const batch = urls.slice(i, i + concurrent);
            const batchResults = await Promise.allSettled(
                batch.map(url => checkUrl(url, timeout))
            );

            for (let j = 0; j < batch.length; j++) {
                const url = batch[j];
                const result = batchResults[j];

                if (result.status === 'fulfilled') {
                    const status = result.value;
                    results.statuses[url] = status;
                    results.total_checked++;

                    // Categorize status
                    if (status >= 200 && status < 300) {
                        results.summary['2xx']++;
                        results.passed++;
                    } else if (status >= 300 && status < 400) {
                        results.summary['3xx']++;
                        if (treat3xxAsPass) {
                            results.passed++;
                        } else {
                            results.failed++;
                        }
                    } else if (status >= 400 && status < 500) {
                        results.summary['4xx']++;
                        results.failed++;
                    } else if (status >= 500 && status < 600) {
                        results.summary['5xx']++;
                        results.failed++;
                    } else if (status === 'timeout') {
                        results.summary['timeout']++;
                        results.failed++;
                    } else {
                        results.summary['error']++;
                        results.failed++;
                    }
                } else {
                    // Promise rejected
                    results.statuses[url] = 'error';
                    results.summary['error']++;
                    results.failed++;
                    results.total_checked++;
                }
            }

            // Rate limiting between batches
            if (i + concurrent < urls.length) {
                await sleep(rateLimit);
            }
        }

        // Write results
        await fs.writeFile(
            join(linksDir, 'statuses.json'),
            JSON.stringify(results.statuses, null, 2)
        );

        await fs.writeFile(
            join(linksDir, 'check.json'),
            JSON.stringify(results, null, 2)
        );

        console.log(`Check complete: ${results.passed} passed, ${results.failed} failed`);

        return results;

    } catch (error) {
        console.error('Error in link checking:', error);
        results.error = error.message;

        const linksDir = join(taskDir, 'links');
        await fs.writeFile(
            join(linksDir, 'check.json'),
            JSON.stringify(results, null, 2)
        );

        return results;
    }
}

async function checkUrl(url, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            method: 'HEAD', // Use HEAD to avoid downloading content
            signal: controller.signal,
            redirect: 'manual', // Don't follow redirects automatically
            headers: {
                'User-Agent': 'MCP-Gemini-Adjudicator/1.0 (Link Checker)'
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
                    'User-Agent': 'MCP-Gemini-Adjudicator/1.0 (Link Checker)'
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

    await checkLinks(options);
}