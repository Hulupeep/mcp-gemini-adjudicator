/**
 * API Schema Validation Module
 *
 * Validates API responses against JSON Schema with persisted evidence.
 * Produces deterministic schema_result.json for gate enforcement.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Check API against schema
 * @param {Object} options - Configuration options
 * @returns {Object} Schema validation results
 */
export async function checkApi(options) {
    const { apiDir, commitment, claim, profile, url: overrideUrl, schemaPath: overrideSchema } = options;

    // Initialize results
    const results = {
        schema: 'api.schema_result/v1.0',
        timestamp: new Date().toISOString(),
        task_id: commitment?.task_id || claim?.task_id || 'unknown',
        ok: false,
        errors: [],
        warnings: [],
        schema_id: null,
        endpoint: null,
        response_time_ms: null,
        status_code: null
    };

    try {
        // Determine API URL and schema
        const { url, schemaPath } = extractApiConfig(commitment, claim, profile, overrideUrl, overrideSchema);

        if (!url) {
            results.errors.push('No API URL specified in commitment, claim, profile, or --url flag');
            await saveResults(apiDir, results);
            return results;
        }

        if (!schemaPath) {
            results.errors.push('No schema path specified in commitment, claim, profile, or --schema flag');
            await saveResults(apiDir, results);
            return results;
        }

        results.endpoint = url;

        // Load the schema
        let schema;
        try {
            const schemaContent = await fs.promises.readFile(schemaPath, 'utf8');
            schema = JSON.parse(schemaContent);

            // Calculate schema hash/id
            const schemaHash = crypto.createHash('sha256').update(schemaContent).digest('hex');
            results.schema_id = schema.$id || schema.title || schemaHash.substring(0, 12);
        } catch (error) {
            results.errors.push(`Failed to load schema: ${error.message}`);
            await saveResults(apiDir, results);
            return results;
        }

        // Fetch API response
        let response;
        let responseData;
        const startTime = Date.now();

        try {
            // Using dynamic import for node-fetch
            const fetch = (await import('node-fetch')).default;

            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'MCP-Gemini-Adjudicator/1.0'
                },
                timeout: 10000 // 10 second timeout
            });

            results.response_time_ms = Date.now() - startTime;
            results.status_code = response.status;

            if (!response.ok) {
                results.errors.push(`HTTP ${response.status}: ${response.statusText}`);
                await saveResults(apiDir, results);
                return results;
            }

            responseData = await response.json();
        } catch (error) {
            results.response_time_ms = Date.now() - startTime;
            results.errors.push(`Failed to fetch API: ${error.message}`);
            await saveResults(apiDir, results);
            return results;
        }

        // Validate response against schema
        const ajv = new Ajv({ allErrors: true, verbose: true });
        addFormats(ajv); // Add support for format validation (email, uri, etc.)
        const validate = ajv.compile(schema);
        const valid = validate(responseData);

        if (valid) {
            results.ok = true;
        } else {
            results.ok = false;
            // Format validation errors
            if (validate.errors) {
                for (const error of validate.errors) {
                    const errorMsg = `${error.instancePath || '/'}: ${error.message}`;
                    results.errors.push(errorMsg);

                    // Add detailed info for debugging
                    if (error.params) {
                        results.errors.push(`  Details: ${JSON.stringify(error.params)}`);
                    }
                }
            }
        }

        // Check for additional profile requirements
        if (profile) {
            const activeProfile = profile.active || 'default';
            const settings = profile[activeProfile] || profile.api_scrape || {};

            // Check latency budget if specified
            if (settings.latency_budget_ms && results.response_time_ms > settings.latency_budget_ms) {
                results.warnings.push(`Response time ${results.response_time_ms}ms exceeds budget ${settings.latency_budget_ms}ms`);
            }

            // Check required fields if specified
            if (settings.required_fields) {
                for (const field of settings.required_fields) {
                    if (!hasField(responseData, field)) {
                        results.errors.push(`Required field missing: ${field}`);
                        results.ok = false;
                    }
                }
            }
        }

    } catch (error) {
        results.errors.push(`Unexpected error: ${error.message}`);
        results.ok = false;
    }

    // Save results
    await saveResults(apiDir, results);
    return results;
}

/**
 * Extract API configuration from various sources
 */
function extractApiConfig(commitment, claim, profile, overrideUrl, overrideSchema) {
    let url = overrideUrl;
    let schemaPath = overrideSchema;

    // Check commitment for API config
    if (!url && commitment?.api?.endpoint) {
        url = commitment.api.endpoint;
    }
    if (!schemaPath && commitment?.api?.schema) {
        schemaPath = commitment.api.schema;
    }

    // Check claim for API config
    if (!url && claim?.claim?.api?.endpoint) {
        url = claim.claim.api.endpoint;
    }
    if (!schemaPath && claim?.claim?.api?.schema) {
        schemaPath = claim.claim.api.schema;
    }

    // Check profile for API config
    if (profile) {
        const activeProfile = profile.active || 'default';
        const settings = profile[activeProfile] || profile.api_scrape || {};

        if (!url && settings.endpoint) {
            url = settings.endpoint;
        }
        if (!schemaPath && settings.schema_path) {
            schemaPath = settings.schema_path;
        }
    }

    return { url, schemaPath };
}

/**
 * Check if object has nested field
 */
function hasField(obj, fieldPath) {
    const parts = fieldPath.split('.');
    let current = obj;

    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return false;
        }
    }

    return true;
}

/**
 * Save results to JSON file
 */
async function saveResults(apiDir, results) {
    const outputPath = path.join(apiDir, 'schema_result.json');
    await fs.promises.writeFile(outputPath, JSON.stringify(results, null, 2));
}