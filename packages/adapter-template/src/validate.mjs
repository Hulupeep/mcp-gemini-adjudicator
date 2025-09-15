/**
 * Template Validate Capability
 *
 * Validates configuration and inputs according to rules.
 */

export async function validate(options) {
    const { commitment, claim, profile, verbose } = options;

    if (verbose) {
        console.error('Starting validation...');
    }

    const results = {
        schema: 'template.validate/v1.0',
        timestamp: new Date().toISOString(),
        task_id: commitment?.task_id || claim?.task_id || 'unknown',
        valid: true,
        checks: [],
        errors: [],
        warnings: []
    };

    // Validation checks
    const checks = [
        {
            name: 'claim_schema',
            description: 'Claim follows v1.1 schema',
            check: () => claim?.schema === 'verify.claim/v1.1'
        },
        {
            name: 'units_present',
            description: 'Claim has units list',
            check: () => Array.isArray(claim?.claim?.units_list)
        },
        {
            name: 'units_match_total',
            description: 'Units list matches declared total',
            check: () => claim?.claim?.units_list?.length === claim?.claim?.units_total
        },
        {
            name: 'task_id_consistent',
            description: 'Task ID is consistent',
            check: () => !commitment || !claim || commitment.task_id === claim.task_id
        },
        {
            name: 'no_forbidden_fields',
            description: 'No measured facts in claim',
            check: () => {
                const forbidden = ['word_count', 'coverage', 'lint_errors', 'test_results'];
                const claimStr = JSON.stringify(claim);
                return !forbidden.some(field => claimStr.includes(field));
            }
        }
    ];

    // Run checks
    for (const check of checks) {
        const result = {
            name: check.name,
            description: check.description,
            passed: false,
            message: null
        };

        try {
            result.passed = check.check();
            if (!result.passed) {
                results.valid = false;
                results.errors.push(`${check.description} failed`);
            }
        } catch (error) {
            result.passed = false;
            result.message = error.message;
            results.valid = false;
            results.errors.push(`${check.description}: ${error.message}`);
        }

        results.checks.push(result);
    }

    // Add warnings for best practices
    if (claim?.claim?.units_list?.length > 100) {
        results.warnings.push('Large number of units may impact performance');
    }

    if (!profile) {
        results.warnings.push('No verification profile provided');
    }

    if (verbose) {
        console.error(`Validation complete: ${results.valid ? 'PASSED' : 'FAILED'}`);
    }

    return results;
}