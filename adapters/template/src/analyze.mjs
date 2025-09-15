/**
 * Template Analyze Capability
 *
 * Performs detailed analysis of the input data.
 */

export async function analyze(options) {
    const { commitment, claim, profile, verbose } = options;

    if (verbose) {
        console.error('Starting analysis...');
    }

    const results = {
        schema: 'template.analyze/v1.0',
        timestamp: new Date().toISOString(),
        task_id: commitment?.task_id || claim?.task_id || 'unknown',
        analysis: {
            complexity: calculateComplexity(claim),
            patterns: detectPatterns(claim),
            recommendations: []
        },
        statistics: {},
        insights: []
    };

    // Analyze units if available
    if (claim?.claim?.units_list) {
        const units = claim.claim.units_list;

        // Calculate statistics
        results.statistics = {
            total_units: units.length,
            unique_extensions: countExtensions(units),
            avg_path_depth: calculateAvgDepth(units),
            file_distribution: getDistribution(units)
        };

        // Generate insights
        if (units.length > 50) {
            results.insights.push({
                type: 'scale',
                message: 'Large task with many units',
                recommendation: 'Consider breaking into smaller tasks'
            });
        }

        const testFiles = units.filter(u => u.includes('test') || u.includes('spec'));
        if (testFiles.length === 0) {
            results.insights.push({
                type: 'quality',
                message: 'No test files detected',
                recommendation: 'Add test coverage for better verification'
            });
        }
    }

    // Apply profile analysis
    if (profile) {
        const activeProfile = profile.active || 'default';
        const settings = profile[activeProfile] || {};

        if (settings.strict && results.analysis.complexity > 5) {
            results.analysis.recommendations.push(
                'High complexity detected - strict profile may require additional verification'
            );
        }
    }

    if (verbose) {
        console.error(`Analysis complete: ${results.insights.length} insights generated`);
    }

    return results;
}

function calculateComplexity(claim) {
    let complexity = 1;

    if (claim?.claim?.units_list) {
        // Base complexity on number of units
        complexity += Math.floor(claim.claim.units_list.length / 10);

        // Add complexity for different types
        const types = new Set(claim.claim.units_list.map(u => u.split('.').pop()));
        complexity += types.size;
    }

    if (claim?.claim?.scope?.targets) {
        // Add complexity for multiple targets
        complexity += claim.claim.scope.targets.length;
    }

    return Math.min(complexity, 10); // Cap at 10
}

function detectPatterns(claim) {
    const patterns = [];

    if (!claim?.claim?.units_list) {
        return patterns;
    }

    const units = claim.claim.units_list;

    // Check for common patterns
    if (units.every(u => u.startsWith('src/'))) {
        patterns.push('source-only');
    }

    if (units.some(u => u.includes('test')) && units.some(u => !u.includes('test'))) {
        patterns.push('mixed-source-and-tests');
    }

    if (units.every(u => u.endsWith('.js') || u.endsWith('.ts'))) {
        patterns.push('javascript-project');
    }

    if (units.some(u => u.includes('package.json'))) {
        patterns.push('node-project');
    }

    return patterns;
}

function countExtensions(units) {
    const extensions = new Set();
    for (const unit of units) {
        const ext = unit.split('.').pop();
        if (ext && ext !== unit) {
            extensions.add(ext);
        }
    }
    return extensions.size;
}

function calculateAvgDepth(units) {
    if (units.length === 0) return 0;

    const depths = units.map(u => (u.match(/\//g) || []).length);
    const sum = depths.reduce((a, b) => a + b, 0);

    return Math.round((sum / units.length) * 100) / 100;
}

function getDistribution(units) {
    const dist = {};

    for (const unit of units) {
        const parts = unit.split('/');
        if (parts.length > 0) {
            const root = parts[0];
            dist[root] = (dist[root] || 0) + 1;
        }
    }

    // Sort by count
    return Object.entries(dist)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [key, val]) => {
            obj[key] = val;
            return obj;
        }, {});
}