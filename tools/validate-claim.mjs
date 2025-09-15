#!/usr/bin/env node

/**
 * Validates claim JSON against schema and forbids measured results
 * Usage: node validate-claim.mjs <claim.json> [--strict]
 *
 * Returns 0 if valid, 1 if invalid
 */

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Forbidden fields that indicate measured facts
const FORBIDDEN_FIELDS = [
    'word_count', 'word_min', 'word_max',
    'coverage', 'coverage_percent', 'coverage_min', 'coverage_claimed',
    'http_status', 'status_code', 'response_code',
    'response_time', 'latency', 'duration',
    'test_passed', 'test_failed', 'test_results',
    'lint_errors', 'lint_warnings', 'lint_clean', 'lint_fixed',
    'build_status', 'build_success', 'compile_errors',
    'file_size', 'line_count', 'character_count',
    'tests_updated', 'functions_touched', 'files_modified'  // These are okay in scope but not as measured facts
];

function findForbiddenFields(obj, path = '') {
    const violations = [];

    for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Skip allowed locations for certain fields
        if (currentPath.startsWith('claim.scope.files') ||
            currentPath.startsWith('claim.scope.functions')) {
            continue;
        }

        // Check if this field is forbidden
        if (FORBIDDEN_FIELDS.includes(key)) {
            violations.push({
                field: key,
                path: currentPath,
                value: value,
                reason: 'Measured fact not allowed in claims'
            });
        }

        // Recursively check nested objects
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            violations.push(...findForbiddenFields(value, currentPath));
        }
    }

    return violations;
}

async function validateClaim(claimPath, strict = false) {
    try {
        // Read claim file
        const claimData = await fs.readFile(claimPath, 'utf8');
        const claim = JSON.parse(claimData);

        const errors = [];

        // Check required fields
        if (claim.schema !== 'verify.claim/v1.1') {
            errors.push(`Invalid schema: expected "verify.claim/v1.1", got "${claim.schema}"`);
        }

        if (!claim.actor) {
            errors.push('Missing required field: actor');
        }

        if (!claim.task_id) {
            errors.push('Missing required field: task_id');
        }

        if (!claim.timestamp) {
            errors.push('Missing required field: timestamp');
        } else {
            // Validate ISO 8601 format
            const date = new Date(claim.timestamp);
            if (isNaN(date.getTime())) {
                errors.push(`Invalid timestamp format: ${claim.timestamp}`);
            }
        }

        if (!claim.claim) {
            errors.push('Missing required field: claim');
        } else {
            // Validate claim structure
            const c = claim.claim;

            if (!c.type) {
                errors.push('Missing required field: claim.type');
            }

            if (typeof c.units_total !== 'number') {
                errors.push('claim.units_total must be a number');
            }

            if (!Array.isArray(c.units_list)) {
                errors.push('claim.units_list must be an array');
            } else {
                // Critical validation: units_total must equal units_list.length
                if (c.units_total !== c.units_list.length) {
                    errors.push(`units_total (${c.units_total}) must equal units_list.length (${c.units_list.length})`);
                }
            }

            if (!c.scope || !c.scope.repo_root) {
                errors.push('Missing required field: claim.scope.repo_root');
            }
        }

        // Check for forbidden measured fields
        const violations = findForbiddenFields(claim);
        if (violations.length > 0) {
            for (const v of violations) {
                errors.push(`Forbidden measured field "${v.field}" at ${v.path}: ${v.reason}`);
            }
        }

        // Output result
        const result = {
            valid: errors.length === 0,
            errors: errors,
            warnings: []
        };

        // Add warnings for best practices
        if (claim.claim && !claim.claim.declared) {
            result.warnings.push('Consider adding claim.declared with intent and approach');
        }

        console.log(JSON.stringify(result, null, 2));

        // Exit with appropriate code
        if (!result.valid) {
            process.exit(1);
        }

    } catch (error) {
        console.error(JSON.stringify({
            valid: false,
            errors: [`Failed to validate: ${error.message}`]
        }, null, 2));
        process.exit(1);
    }
}

// Main execution
const args = process.argv.slice(2);
const claimPath = args[0];
const strict = args.includes('--strict');

if (!claimPath) {
    console.error('Usage: node validate-claim.mjs <claim.json> [--strict]');
    process.exit(1);
}

validateClaim(claimPath, strict);