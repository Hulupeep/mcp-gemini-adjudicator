/**
 * Template Scan Capability
 *
 * This module demonstrates how to implement a deterministic scan capability.
 * It processes input and generates reproducible artifacts.
 */

import { createHash } from 'crypto';

/**
 * Perform scan operation
 * @param {Object} options - Configuration options
 * @returns {Object} Deterministic scan results
 */
export async function scan(options) {
    const { commitment, claim, profile, verbose } = options;

    if (verbose) {
        console.error('Starting scan operation...');
    }

    // Initialize results structure
    const results = {
        schema: 'template.scan/v1.0',
        timestamp: new Date().toISOString(),
        task_id: commitment?.task_id || claim?.task_id || 'unknown',
        scan_type: 'template',
        items_scanned: [],
        summary: {
            total_items: 0,
            processed: 0,
            skipped: 0,
            errors: 0
        },
        metadata: {}
    };

    // Process claim units if available
    if (claim?.claim?.units_list) {
        const units = claim.claim.units_list;

        if (verbose) {
            console.error(`Processing ${units.length} units from claim...`);
        }

        for (const unit of units) {
            // Create deterministic hash for each unit
            const hash = createHash('sha256')
                .update(unit)
                .digest('hex')
                .substring(0, 8);

            const item = {
                id: unit,
                type: detectType(unit),
                status: 'scanned',
                hash: hash,
                size: unit.length, // Simplified: using string length
                attributes: extractAttributes(unit)
            };

            results.items_scanned.push(item);
            results.summary.processed++;
        }

        results.summary.total_items = units.length;
    }

    // Apply profile settings if available
    if (profile) {
        const activeProfile = profile.active || 'default';
        results.metadata.profile = activeProfile;

        // Example: Apply scan depth from profile
        if (profile[activeProfile]?.scan_depth) {
            results.metadata.scan_depth = profile[activeProfile].scan_depth;
        }
    }

    // Sort items for deterministic output
    results.items_scanned.sort((a, b) => a.id.localeCompare(b.id));

    // Calculate aggregate metrics
    results.metrics = {
        avg_item_size: results.items_scanned.length > 0
            ? Math.round(results.items_scanned.reduce((sum, item) => sum + item.size, 0) / results.items_scanned.length)
            : 0,
        unique_types: [...new Set(results.items_scanned.map(item => item.type))].length,
        scan_complete: results.summary.processed === results.summary.total_items
    };

    if (verbose) {
        console.error(`Scan complete: ${results.summary.processed}/${results.summary.total_items} items`);
    }

    return results;
}

/**
 * Detect item type based on patterns
 * @param {string} item - Item identifier
 * @returns {string} Item type
 */
function detectType(item) {
    if (item.endsWith('.js') || item.endsWith('.mjs')) return 'javascript';
    if (item.endsWith('.ts') || item.endsWith('.tsx')) return 'typescript';
    if (item.endsWith('.py')) return 'python';
    if (item.endsWith('.md')) return 'markdown';
    if (item.endsWith('.json')) return 'json';
    if (item.endsWith('.yaml') || item.endsWith('.yml')) return 'yaml';
    if (item.includes('://')) return 'url';
    if (item.startsWith('/')) return 'path';
    return 'unknown';
}

/**
 * Extract attributes from item
 * @param {string} item - Item identifier
 * @returns {Object} Item attributes
 */
function extractAttributes(item) {
    const attributes = {};

    // Extract file extension
    const lastDot = item.lastIndexOf('.');
    if (lastDot > 0 && lastDot < item.length - 1) {
        attributes.extension = item.substring(lastDot + 1);
    }

    // Extract directory depth
    const slashes = (item.match(/\//g) || []).length;
    attributes.depth = slashes;

    // Check for test files
    if (item.includes('test') || item.includes('spec')) {
        attributes.is_test = true;
    }

    // Check for source files
    if (item.includes('/src/') || item.includes('/lib/')) {
        attributes.is_source = true;
    }

    return attributes;
}