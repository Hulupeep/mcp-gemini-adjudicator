#!/usr/bin/env node
/**
 * API Check Module
 * Validates API endpoints and schemas
 */

import { promises as fs } from 'fs';
import { join } from 'path';

export async function checkApis(options) {
    const { taskDir, commitment, claim, profile } = options;

    const results = {
        total_checked: 0,
        passed: 0,
        failed: 0,
        endpoints: {},
        schema_validation: {},
        response_times: {},
        timestamp: new Date().toISOString()
    };

    try {
        const apiDir = join(taskDir, 'api');
        await fs.mkdir(apiDir, { recursive: true });

        // Get endpoints from claim or commitment
        let endpoints = [];

        if (claim?.claimed?.endpoints) {
            endpoints = claim.claimed.endpoints;
        } else if (commitment?.commitments?.scope?.endpoints) {
            endpoints = commitment.commitments.scope.endpoints;
        }

        if (endpoints.length === 0) {
            console.log('No API endpoints to check');
            await fs.writeFile(
                join(apiDir, 'check.json'),
                JSON.stringify(results, null, 2)
            );
            return results;
        }

        // Get profile settings
        const profileName = commitment?.profile || 'api_basic';
        const profileSettings = profile[profileName] || profile.api_basic || {};
        const timeout = profileSettings.timeout_ms || 10000;
        const validateSchema = profileSettings.validate_schema || false;
        const checkResponseTime = profileSettings.check_response_time || false;
        const maxResponseTime = profileSettings.max_response_time_ms || 2000;

        console.log(`Checking ${endpoints.length} API endpoints with profile: ${profileName}`);

        // Check each endpoint
        for (const endpoint of endpoints) {
            const startTime = Date.now();
            const endpointResult = await checkEndpoint(endpoint, timeout);
            const responseTime = Date.now() - startTime;

            results.endpoints[endpoint.url || endpoint] = {
                status: endpointResult.status,
                response_time: responseTime,
                content_type: endpointResult.contentType,
                size: endpointResult.size
            };

            results.response_times[endpoint.url || endpoint] = responseTime;
            results.total_checked++;

            // Check response time if required
            if (checkResponseTime && responseTime > maxResponseTime) {
                results.failed++;
                console.log(`  ✗ ${endpoint.url || endpoint}: Response time ${responseTime}ms > ${maxResponseTime}ms`);
            } else if (endpointResult.status >= 200 && endpointResult.status < 300) {
                results.passed++;
                console.log(`  ✓ ${endpoint.url || endpoint}: ${endpointResult.status} (${responseTime}ms)`);
            } else {
                results.failed++;
                console.log(`  ✗ ${endpoint.url || endpoint}: ${endpointResult.status}`);
            }

            // Schema validation if required
            if (validateSchema && endpoint.schema) {
                const schemaResult = await validateResponseSchema(
                    endpointResult.body,
                    endpoint.schema
                );
                results.schema_validation[endpoint.url || endpoint] = schemaResult;

                if (!schemaResult.valid) {
                    results.failed++;
                    console.log(`    Schema validation failed: ${schemaResult.errors.join(', ')}`);
                }
            }
        }

        // Write results
        await fs.writeFile(
            join(apiDir, 'check.json'),
            JSON.stringify(results, null, 2)
        );

        // Store sample responses
        if (Object.keys(results.endpoints).length > 0) {
            const samples = {};
            for (const [url, data] of Object.entries(results.endpoints)) {
                if (data.status >= 200 && data.status < 300) {
                    samples[url] = {
                        status: data.status,
                        headers: data.headers,
                        sample: data.body ? data.body.substring(0, 1000) : null
                    };
                }
            }

            await fs.writeFile(
                join(apiDir, 'response.json'),
                JSON.stringify(samples, null, 2)
            );
        }

        console.log(`API check complete: ${results.passed} passed, ${results.failed} failed`);

        return results;

    } catch (error) {
        console.error('Error in API checking:', error);
        results.error = error.message;

        const apiDir = join(taskDir, 'api');
        await fs.writeFile(
            join(apiDir, 'check.json'),
            JSON.stringify(results, null, 2)
        );

        return results;
    }
}

async function checkEndpoint(endpoint, timeout) {
    const url = typeof endpoint === 'string' ? endpoint : endpoint.url;
    const method = endpoint.method || 'GET';
    const headers = endpoint.headers || {};
    const body = endpoint.body || null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'User-Agent': 'MCP-Gemini-Adjudicator/1.0 (API Checker)',
                ...headers
            },
            body: body ? JSON.stringify(body) : null,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type');
        let responseBody = null;

        try {
            if (contentType && contentType.includes('application/json')) {
                responseBody = await response.json();
            } else {
                responseBody = await response.text();
            }
        } catch {}

        return {
            status: response.status,
            contentType: contentType,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseBody,
            size: response.headers.get('content-length') || 0
        };

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            return { status: 'timeout', error: 'Request timeout' };
        }

        return { status: 'error', error: error.message };
    }
}

async function validateResponseSchema(response, schema) {
    // Basic schema validation (can be enhanced with ajv or joi)
    const result = {
        valid: true,
        errors: []
    };

    if (!response || !schema) {
        return result;
    }

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
        for (const field of schema.required) {
            if (!(field in response)) {
                result.valid = false;
                result.errors.push(`Missing required field: ${field}`);
            }
        }
    }

    // Check field types
    if (schema.properties) {
        for (const [field, fieldSchema] of Object.entries(schema.properties)) {
            if (field in response) {
                const actualType = typeof response[field];
                const expectedType = fieldSchema.type;

                if (expectedType && actualType !== expectedType) {
                    result.valid = false;
                    result.errors.push(`Field ${field}: expected ${expectedType}, got ${actualType}`);
                }
            }
        }
    }

    // Check array items
    if (schema.type === 'array' && schema.items) {
        if (!Array.isArray(response)) {
            result.valid = false;
            result.errors.push('Response is not an array');
        } else if (schema.minItems && response.length < schema.minItems) {
            result.valid = false;
            result.errors.push(`Array has ${response.length} items, minimum ${schema.minItems} required`);
        }
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

    await checkApis(options);
}