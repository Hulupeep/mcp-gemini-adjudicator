#!/usr/bin/env node

/**
 * CI Artifact Validation Tool
 *
 * Validates artifacts for CI/CD pipeline:
 * - Schema validation for claim and artifacts
 * - Required files check based on task type and profile
 * - Checksum verification
 *
 * Usage: node ci-validate-artifacts.mjs <task-dir>
 * Exit codes:
 *   0 - All validations passed
 *   1 - Missing arguments or files
 *   2 - Validation failures (schema, checksum, required files)
 *   3 - Unexpected errors
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize AJV for schema validation
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// Colors for terminal output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(level, message) {
    const prefix = {
        error: `${colors.red}❌ ERROR${colors.reset}`,
        warn: `${colors.yellow}⚠️  WARN${colors.reset}`,
        info: `${colors.blue}ℹ️  INFO${colors.reset}`,
        success: `${colors.green}✅ PASS${colors.reset}`
    };
    console.error(`${prefix[level] || level}: ${message}`);
}

// Load and compile schemas
function loadSchemas() {
    const schemas = {};

    try {
        // Load claim schema
        const claimSchemaPath = path.join(__dirname, '..', 'schemas', 'verify.claim.v1_1.schema.json');
        schemas.claim = JSON.parse(fs.readFileSync(claimSchemaPath, 'utf8'));

        // Load artifacts index schema
        const artifactsSchemaPath = path.join(__dirname, '..', 'schemas', 'artifacts.index.schema.json');
        schemas.artifacts = JSON.parse(fs.readFileSync(artifactsSchemaPath, 'utf8'));

        return schemas;
    } catch (error) {
        log('error', `Failed to load schemas: ${error.message}`);
        process.exit(3);
    }
}

// Validate JSON against schema
function validateSchema(data, schema, name) {
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
        log('error', `${name} schema validation failed:`);
        validate.errors.forEach(err => {
            log('error', `  - ${err.instancePath || '/'}: ${err.message}`);
        });
        return false;
    }

    log('success', `${name} schema validation passed`);
    return true;
}

// Check for required artifacts based on task type and profile
function checkRequiredArtifacts(taskDir, commitment, profile) {
    const missing = [];
    const type = commitment.type || 'default';
    const profileSettings = profile[type] || profile.default || {};

    log('info', `Checking required artifacts for task type: ${type}`);

    // Helper to check if file exists
    const must = (filePath, description) => {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(taskDir, filePath);
        if (!fs.existsSync(fullPath)) {
            missing.push(`${description || filePath} (${filePath})`);
            return false;
        }
        return true;
    };

    // Type-specific requirements
    switch (type) {
        case 'code_update':
        case 'code':
            // Always required for code tasks
            must('diff.json', 'Code diff');
            must('diff_names.json', 'Changed file names');

            // Conditionally required based on profile
            if (profileSettings.lint_clean !== false) {
                must('lint.json', 'Lint results');
            }

            if (profileSettings.test_pass_required) {
                must('tests.json', 'Test results');
            }

            if (profileSettings.coverage_min != null) {
                must('coverage.json', 'Coverage report');
            }

            if (profileSettings.build_required) {
                must('build.json', 'Build results');
            }
            break;

        case 'link_check':
        case 'links':
            must('links/urlset.json', 'URL set');
            must('links/statuses.json', 'Link statuses');

            if (profileSettings.resample_enabled) {
                must('links/resample.json', 'Resample results');
            }
            break;

        case 'content':
            must('content/scan.json', 'Content scan');

            if (profileSettings.word_count_required) {
                must('content/wordcount.json', 'Word count');
            }

            if (profileSettings.headings_required) {
                must('content/headings.json', 'Headings analysis');
            }
            break;

        case 'api_test':
        case 'api':
            must('api/endpoints.json', 'API endpoints');

            if (profileSettings.response_validation) {
                must('api/responses.json', 'API responses');
            }

            if (profileSettings.schema_validation) {
                must('api/schema.json', 'API schema');
            }

            if (profileSettings.auth_required) {
                must('api/auth.json', 'Authentication info');
            }
            break;
    }

    // Common artifacts that should always exist
    must('claim.json', 'Claim file');
    must('commitment.json', 'Commitment file');

    // Check for verdict if in post-verification stage
    if (fs.existsSync(path.join(taskDir, 'verdict.json'))) {
        must('verdict.json', 'Verdict file');
    }

    if (missing.length > 0) {
        log('error', `Missing required artifacts (${missing.length}):`);
        missing.forEach(m => log('error', `  - ${m}`));
        return false;
    }

    log('success', 'All required artifacts present');
    return true;
}

// Verify checksums
function verifyChecksums(taskDir) {
    const checksumsPath = path.join(taskDir, 'checksums.sha256');
    const artifactsPath = path.join(taskDir, 'artifacts.json');

    // Checksums are optional but if present, must be valid
    if (!fs.existsSync(checksumsPath)) {
        log('info', 'No checksums file found (optional)');
        return true;
    }

    if (!fs.existsSync(artifactsPath)) {
        log('warn', 'Checksums exist but no artifacts.json index');
        return true;
    }

    log('info', 'Verifying checksums...');

    try {
        // Parse checksums file (format: hash  filename)
        const checksumsContent = fs.readFileSync(checksumsPath, 'utf8');
        const checksums = new Map();

        checksumsContent.trim().split('\n').forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                // Standard format: hash filename
                const [hash, ...filenameParts] = parts;
                const filename = filenameParts.join(' ');
                checksums.set(filename, hash);
            }
        });

        // Parse artifacts index
        const artifacts = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
        const files = artifacts.files || Object.keys(artifacts.artifacts || {});

        let failures = 0;

        // Verify each file
        for (const file of files) {
            // Skip non-artifact files
            if (file === 'checksums.sha256' || file === 'artifacts.json') continue;

            const filePath = path.join(taskDir, file);

            if (!fs.existsSync(filePath)) {
                log('warn', `File listed but not found: ${file}`);
                continue;
            }

            // Calculate actual hash
            const content = fs.readFileSync(filePath);
            const actualHash = crypto.createHash('sha256').update(content).digest('hex');

            // Check against checksums file
            const expectedHash = checksums.get(file);

            if (expectedHash && actualHash !== expectedHash) {
                log('error', `CHECKSUM_MISMATCH: ${file}`);
                log('error', `  Expected: ${expectedHash}`);
                log('error', `  Actual:   ${actualHash}`);
                failures++;
            }

            // Also check against artifacts.json if it has hashes
            if (artifacts.artifacts && artifacts.artifacts[file]) {
                const artifactHash = artifacts.artifacts[file].sha256;
                if (artifactHash && actualHash !== artifactHash) {
                    log('error', `ARTIFACT_HASH_MISMATCH: ${file}`);
                    log('error', `  In artifacts.json: ${artifactHash}`);
                    log('error', `  Actual:           ${actualHash}`);
                    failures++;
                }
            }
        }

        if (failures > 0) {
            log('error', `Checksum verification failed: ${failures} mismatches`);
            return false;
        }

        log('success', `Checksum verification passed (${files.length} files)`);
        return true;

    } catch (error) {
        log('error', `Checksum verification error: ${error.message}`);
        return false;
    }
}

// Validate JSON files are parseable
function validateJsonFiles(taskDir) {
    const jsonFiles = [];

    // Find all JSON files recursively
    function findJsonFiles(dir, prefix = '') {
        const items = fs.readdirSync(dir);

        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = prefix ? path.join(prefix, item) : item;

            if (fs.statSync(fullPath).isDirectory()) {
                findJsonFiles(fullPath, relativePath);
            } else if (item.endsWith('.json')) {
                jsonFiles.push(relativePath);
            }
        }
    }

    findJsonFiles(taskDir);

    log('info', `Validating ${jsonFiles.length} JSON files...`);

    let failures = 0;
    for (const file of jsonFiles) {
        const filePath = path.join(taskDir, file);

        try {
            JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            log('error', `Invalid JSON in ${file}: ${error.message}`);
            failures++;
        }
    }

    if (failures > 0) {
        log('error', `JSON validation failed: ${failures} invalid files`);
        return false;
    }

    log('success', 'All JSON files are valid');
    return true;
}

// Main validation function
async function main() {
    const taskDir = process.argv[2];

    if (!taskDir) {
        log('error', 'Usage: node ci-validate-artifacts.mjs <task-dir>');
        process.exit(1);
    }

    if (!fs.existsSync(taskDir)) {
        log('error', `Task directory not found: ${taskDir}`);
        process.exit(1);
    }

    log('info', `Validating artifacts in: ${taskDir}`);

    let hasErrors = false;

    // 1. Validate all JSON files are parseable
    if (!validateJsonFiles(taskDir)) {
        hasErrors = true;
    }

    // 2. Load schemas
    const schemas = loadSchemas();

    // 3. Validate claim against schema
    const claimPath = path.join(taskDir, 'claim.json');
    if (fs.existsSync(claimPath)) {
        try {
            const claim = JSON.parse(fs.readFileSync(claimPath, 'utf8'));
            if (!validateSchema(claim, schemas.claim, 'Claim')) {
                hasErrors = true;
            }
        } catch (error) {
            log('error', `Failed to load claim.json: ${error.message}`);
            hasErrors = true;
        }
    } else {
        log('error', 'claim.json not found');
        hasErrors = true;
    }

    // 4. Validate artifacts.json against schema
    const artifactsPath = path.join(taskDir, 'artifacts.json');
    if (fs.existsSync(artifactsPath)) {
        try {
            const artifacts = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
            if (!validateSchema(artifacts, schemas.artifacts, 'Artifacts index')) {
                hasErrors = true;
            }
        } catch (error) {
            log('error', `Failed to load artifacts.json: ${error.message}`);
            hasErrors = true;
        }
    }

    // 5. Load commitment and profile
    let commitment = {};
    let profile = {};

    const commitmentPath = path.join(taskDir, 'commitment.json');
    if (fs.existsSync(commitmentPath)) {
        try {
            commitment = JSON.parse(fs.readFileSync(commitmentPath, 'utf8'));
        } catch (error) {
            log('error', `Failed to load commitment.json: ${error.message}`);
            hasErrors = true;
        }
    }

    const profilePath = path.join(__dirname, '..', 'config', 'verification.profiles.json');
    if (fs.existsSync(profilePath)) {
        try {
            profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        } catch (error) {
            log('warn', `Failed to load profile: ${error.message}`);
        }
    }

    // 6. Check required artifacts
    if (!checkRequiredArtifacts(taskDir, commitment, profile)) {
        hasErrors = true;
    }

    // 7. Verify checksums
    if (!verifyChecksums(taskDir)) {
        hasErrors = true;
    }

    // 8. Final verdict
    if (hasErrors) {
        log('error', 'Artifact validation FAILED');
        process.exit(2);
    } else {
        log('success', 'All artifact validations PASSED');
        process.exit(0);
    }
}

// Run validation
main().catch(error => {
    log('error', `Unexpected error: ${error.message}`);
    console.error(error.stack);
    process.exit(3);
});