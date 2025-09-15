/**
 * Function and Endpoint Mapping Module
 *
 * Analyzes code diffs and claims to map functions/endpoints with confidence levels.
 * Produces deterministic function_map.json for gate enforcement.
 */

import fs from 'fs';
import path from 'path';

/**
 * Map functions and endpoints from code changes
 * @param {Object} options - Configuration options
 * @returns {Object} Function mapping results
 */
export async function mapFunctions(options) {
    const { taskDir, commitment, claim, profile, verbose } = options;

    if (verbose) {
        console.error('Starting function/endpoint mapping...');
    }

    // Initialize results
    const results = {
        schema: 'function_map/v1.0',
        timestamp: new Date().toISOString(),
        task_id: commitment?.task_id || claim?.task_id || 'unknown',
        matched: [],
        unmatched_claims: [],
        unmatched_diffs: [],
        statistics: {
            total_claimed: 0,
            matched_certain: 0,
            matched_fuzzy: 0,
            unmatched: 0
        }
    };

    // Load diff data if available
    let diffData = {};
    let diffNames = {};
    let diffs = '';

    try {
        const diffPath = path.join(taskDir, 'diff.json');
        if (fs.existsSync(diffPath)) {
            diffData = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
        }

        const diffNamesPath = path.join(taskDir, 'diff_names.json');
        if (fs.existsSync(diffNamesPath)) {
            diffNames = JSON.parse(fs.readFileSync(diffNamesPath, 'utf8'));
        }

        const patchPath = path.join(taskDir, 'diffs.patch');
        if (fs.existsSync(patchPath)) {
            diffs = fs.readFileSync(patchPath, 'utf8');
        }
    } catch (error) {
        console.error(`Warning: Could not load diff data: ${error.message}`);
    }

    // Extract claimed functions/endpoints
    const claimedUnits = extractClaimedUnits(claim, commitment);
    results.statistics.total_claimed = claimedUnits.length;

    if (verbose) {
        console.error(`Processing ${claimedUnits.length} claimed units...`);
    }

    // Analyze diffs to extract actual functions/endpoints
    const actualUnits = extractActualUnits(diffData, diffNames, diffs);

    // Match claimed units with actual changes
    for (const claimedUnit of claimedUnits) {
        const match = findBestMatch(claimedUnit, actualUnits, diffs);

        if (match) {
            results.matched.push(match);

            if (match.certainty === 'certain') {
                results.statistics.matched_certain++;
            } else {
                results.statistics.matched_fuzzy++;
            }
        } else {
            results.unmatched_claims.push(claimedUnit.id);
            results.statistics.unmatched++;
        }
    }

    // Find diff changes not claimed
    for (const actualUnit of actualUnits) {
        const claimed = results.matched.some(m =>
            m.file === actualUnit.file &&
            overlapsLines(m.lines, actualUnit.lines)
        );

        if (!claimed && actualUnit.significant) {
            results.unmatched_diffs.push({
                file: actualUnit.file,
                type: actualUnit.type,
                name: actualUnit.name,
                lines: actualUnit.lines
            });
        }
    }

    // Apply profile rules if available
    if (profile) {
        const activeProfile = profile.active || 'default';
        const settings = profile[activeProfile] || {};

        // Add confidence threshold from profile
        if (settings.function_certainty_required) {
            results.confidence_threshold = settings.function_certainty_required;
        }
    }

    // Sort for deterministic output
    results.matched.sort((a, b) => a.id.localeCompare(b.id));
    results.unmatched_claims.sort();
    results.unmatched_diffs.sort((a, b) =>
        a.file.localeCompare(b.file) || a.lines[0] - b.lines[0]
    );

    if (verbose) {
        console.error(`Mapping complete: ${results.statistics.matched_certain} certain, ${results.statistics.matched_fuzzy} fuzzy, ${results.statistics.unmatched} unmatched`);
    }

    return results;
}

/**
 * Extract claimed units from claim and commitment
 */
function extractClaimedUnits(claim, commitment) {
    const units = [];

    // From claim units_list
    if (claim?.claim?.units_list) {
        for (const unit of claim.claim.units_list) {
            // Parse different unit formats
            if (unit.startsWith('func:') || unit.startsWith('function:')) {
                units.push({
                    id: unit,
                    type: 'function',
                    name: unit.replace(/^(func|function):/, '')
                });
            } else if (unit.startsWith('ep:') || unit.startsWith('endpoint:') || unit.startsWith('/')) {
                units.push({
                    id: unit,
                    type: 'endpoint',
                    name: unit.replace(/^(ep|endpoint):/, '')
                });
            } else if (unit.includes('::') || unit.includes('.')) {
                // Class methods or module functions
                units.push({
                    id: `func:${unit}`,
                    type: 'function',
                    name: unit
                });
            }
        }
    }

    // From commitment if it has specific functions/endpoints
    if (commitment?.requirements?.functions) {
        for (const func of commitment.requirements.functions) {
            if (!units.some(u => u.name === func)) {
                units.push({
                    id: `func:${func}`,
                    type: 'function',
                    name: func
                });
            }
        }
    }

    if (commitment?.requirements?.endpoints) {
        for (const ep of commitment.requirements.endpoints) {
            if (!units.some(u => u.name === ep)) {
                units.push({
                    id: `ep:${ep}`,
                    type: 'endpoint',
                    name: ep
                });
            }
        }
    }

    return units;
}

/**
 * Extract actual functions/endpoints from diffs
 */
function extractActualUnits(diffData, diffNames, diffs) {
    const units = [];
    const processedFiles = new Set();

    // Get list of modified files
    const modifiedFiles = [
        ...(diffData.files_modified || []),
        ...(diffData.files_created || []),
        ...(diffNames.modified || []),
        ...(diffNames.added || [])
    ];

    // Parse diff patches to extract functions
    if (diffs) {
        const diffLines = diffs.split('\n');
        let currentFile = null;
        let currentHunk = null;
        let lineNumber = 0;

        for (const line of diffLines) {
            // File header
            if (line.startsWith('diff --git')) {
                const match = line.match(/b\/(.+)$/);
                if (match) {
                    currentFile = match[1];
                    processedFiles.add(currentFile);
                }
            }

            // Hunk header
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
                if (match) {
                    lineNumber = parseInt(match[1]);
                    currentHunk = match[2] ? match[2].trim() : '';

                    // Try to extract function name from hunk header
                    const funcMatch = currentHunk.match(/(?:function|def|func|method|class)\s+(\w+)/);
                    if (funcMatch && currentFile) {
                        units.push({
                            file: currentFile,
                            type: 'function',
                            name: funcMatch[1],
                            lines: [lineNumber, lineNumber + 20], // Estimate
                            context: currentHunk,
                            significant: true
                        });
                    }
                }
            }

            // Look for function/endpoint definitions in added lines
            if (line.startsWith('+') && !line.startsWith('+++')) {
                const content = line.substring(1);

                // JavaScript/TypeScript functions
                const jsFunc = content.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
                if (jsFunc && currentFile) {
                    const name = jsFunc[1] || jsFunc[2];
                    units.push({
                        file: currentFile,
                        type: 'function',
                        name: name,
                        lines: [lineNumber, lineNumber + 10],
                        significant: true
                    });
                }

                // Class methods
                const method = content.match(/^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/);
                if (method && currentFile && !method[1].match(/^(if|for|while|switch)$/)) {
                    units.push({
                        file: currentFile,
                        type: 'function',
                        name: method[1],
                        lines: [lineNumber, lineNumber + 10],
                        significant: true
                    });
                }

                // API endpoints
                const endpoint = content.match(/(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)/);
                if (endpoint && currentFile) {
                    units.push({
                        file: currentFile,
                        type: 'endpoint',
                        name: endpoint[2],
                        method: endpoint[1].toUpperCase(),
                        lines: [lineNumber, lineNumber + 5],
                        significant: true
                    });
                }

                // Python functions
                const pyFunc = content.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
                if (pyFunc && currentFile) {
                    units.push({
                        file: currentFile,
                        type: 'function',
                        name: pyFunc[1],
                        lines: [lineNumber, lineNumber + 10],
                        significant: true
                    });
                }

                lineNumber++;
            } else if (line.startsWith(' ')) {
                lineNumber++;
            }
        }
    }

    // Deduplicate by file + name
    const seen = new Set();
    const deduped = [];

    for (const unit of units) {
        const key = `${unit.file}:${unit.name}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(unit);
        }
    }

    return deduped;
}

/**
 * Find best match for a claimed unit
 */
function findBestMatch(claimedUnit, actualUnits, diffs) {
    const candidates = [];

    for (const actualUnit of actualUnits) {
        // Skip type mismatches
        if (claimedUnit.type !== actualUnit.type) {
            continue;
        }

        // Calculate match score
        let score = 0;
        let certainty = 'none';

        // Exact name match
        if (claimedUnit.name === actualUnit.name) {
            score = 100;
            certainty = 'certain';
        }
        // Case-insensitive match
        else if (claimedUnit.name.toLowerCase() === actualUnit.name.toLowerCase()) {
            score = 90;
            certainty = 'certain';
        }
        // Partial match
        else if (actualUnit.name.includes(claimedUnit.name) ||
                 claimedUnit.name.includes(actualUnit.name)) {
            score = 60;
            certainty = 'fuzzy';
        }
        // Similar names (Levenshtein distance)
        else if (similarity(claimedUnit.name, actualUnit.name) > 0.7) {
            score = 40;
            certainty = 'fuzzy';
        }

        if (score > 0) {
            candidates.push({
                id: claimedUnit.id,
                file: actualUnit.file,
                name: actualUnit.name,
                lines: actualUnit.lines,
                certainty: certainty,
                score: score,
                type: claimedUnit.type
            });
        }
    }

    // Return best match
    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        delete best.score; // Remove internal score from output
        return best;
    }

    // Try fuzzy matching in diff content
    if (diffs && claimedUnit.name) {
        const pattern = new RegExp(`\\b${escapeRegex(claimedUnit.name)}\\b`, 'i');
        if (pattern.test(diffs)) {
            return {
                id: claimedUnit.id,
                file: 'unknown',
                name: claimedUnit.name,
                lines: [0, 0],
                certainty: 'fuzzy',
                type: claimedUnit.type,
                note: 'Found in diff but location uncertain'
            };
        }
    }

    return null;
}

/**
 * Check if line ranges overlap
 */
function overlapsLines(range1, range2) {
    if (!range1 || !range2 || range1.length < 2 || range2.length < 2) {
        return false;
    }
    return range1[1] >= range2[0] && range2[1] >= range1[0];
}

/**
 * Calculate string similarity (simple Levenshtein ratio)
 */
function similarity(s1, s2) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) {
        return 1.0;
    }

    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(s1, s2) {
    const costs = [];

    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) {
            costs[s2.length] = lastValue;
        }
    }

    return costs[s2.length];
}

/**
 * Escape regex special characters
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}