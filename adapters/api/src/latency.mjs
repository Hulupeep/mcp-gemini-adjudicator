/**
 * API Latency Measurement Module
 *
 * Measures API response times and calculates p50/p95 percentiles.
 * Produces deterministic latency.json for performance monitoring.
 */

import fs from 'fs';
import path from 'path';

/**
 * Measure API latency
 * @param {Object} options - Configuration options
 * @returns {Object} Latency measurement results
 */
export async function measureLatency(options) {
    const { apiDir, commitment, claim, profile, url: overrideUrl } = options;

    // Initialize results
    const results = {
        schema: 'api.latency/v1.0',
        timestamp: new Date().toISOString(),
        task_id: commitment?.task_id || claim?.task_id || 'unknown',
        endpoint: null,
        samples: [],
        metrics: {
            min: null,
            max: null,
            mean: null,
            p50: null,
            p95: null,
            p99: null
        },
        errors: []
    };

    try {
        // Determine API URL
        const url = overrideUrl ||
                   commitment?.api?.endpoint ||
                   claim?.claim?.api?.endpoint ||
                   profile?.api_scrape?.endpoint;

        if (!url) {
            results.errors.push('No API URL specified');
            await saveResults(apiDir, results);
            return results;
        }

        results.endpoint = url;

        // Get sampling parameters from profile
        const sampleCount = profile?.api_scrape?.latency_samples || 10;
        const sampleDelay = profile?.api_scrape?.sample_delay_ms || 100;

        console.log(`Measuring latency for ${url} with ${sampleCount} samples...`);

        // Collect latency samples
        const fetch = (await import('node-fetch')).default;

        for (let i = 0; i < sampleCount; i++) {
            const startTime = Date.now();

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'MCP-Gemini-Adjudicator/1.0'
                    },
                    timeout: 10000
                });

                const latency = Date.now() - startTime;
                results.samples.push({
                    sample: i + 1,
                    latency_ms: latency,
                    status: response.status,
                    ok: response.ok
                });

                console.log(`  Sample ${i + 1}: ${latency}ms (${response.status})`);

            } catch (error) {
                const latency = Date.now() - startTime;
                results.samples.push({
                    sample: i + 1,
                    latency_ms: latency,
                    error: error.message
                });
                console.log(`  Sample ${i + 1}: ${latency}ms (error: ${error.message})`);
            }

            // Delay between samples to avoid rate limiting
            if (i < sampleCount - 1) {
                await new Promise(resolve => setTimeout(resolve, sampleDelay));
            }
        }

        // Calculate metrics
        const validSamples = results.samples
            .filter(s => !s.error)
            .map(s => s.latency_ms)
            .sort((a, b) => a - b);

        if (validSamples.length > 0) {
            results.metrics.min = validSamples[0];
            results.metrics.max = validSamples[validSamples.length - 1];
            results.metrics.mean = Math.round(validSamples.reduce((a, b) => a + b, 0) / validSamples.length);
            results.metrics.p50 = percentile(validSamples, 50);
            results.metrics.p95 = percentile(validSamples, 95);
            results.metrics.p99 = percentile(validSamples, 99);
        } else {
            results.errors.push('No valid samples collected');
        }

    } catch (error) {
        results.errors.push(`Unexpected error: ${error.message}`);
    }

    // Save results
    await saveResults(apiDir, results);
    return results;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray, p) {
    if (sortedArray.length === 0) return null;

    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
        return sortedArray[lower];
    }

    // Linear interpolation
    const weight = index - lower;
    return Math.round(sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight);
}

/**
 * Save results to JSON file
 */
async function saveResults(apiDir, results) {
    const outputPath = path.join(apiDir, 'latency.json');
    await fs.promises.writeFile(outputPath, JSON.stringify(results, null, 2));
}