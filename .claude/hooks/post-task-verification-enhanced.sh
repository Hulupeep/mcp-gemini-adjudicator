#!/bin/bash

# Enhanced Post-task hook: Phase 2 with code verification
# Handles both content (Phase 1) and code (Phase 2) verification

set -e

LOG_FILE=".claude/hooks/verification.log"
COMMITMENT_FILE=".claude/verification/commitment.json"
CLAIM_FILE=".claude/verification/claim.json"
VERDICT_FILE=".claude/verification/verdict.json"
PROFILE_FILE="verification.profiles.json"

echo "[$(date)] Enhanced post-task verification (Phase 2)" >> "$LOG_FILE"

# Get tool input from stdin
TOOL_INPUT=$(cat)

# Pass through the original input immediately
echo "$TOOL_INPUT"

# Check if commitment exists
if [ ! -f "$COMMITMENT_FILE" ]; then
    echo "WARNING: No commitment file found" >> "$LOG_FILE"
    exit 0
fi

COMMITMENT=$(cat "$COMMITMENT_FILE")
TASK_ID=$(echo "$COMMITMENT" | jq -r '.task_id')
TASK_TYPE=$(echo "$COMMITMENT" | jq -r '.type')
PROFILE=$(echo "$COMMITMENT" | jq -r '.profile // "content_default"')

echo "Processing task $TASK_ID: type=$TASK_TYPE, profile=$PROFILE" >> "$LOG_FILE"

# Create artifacts directory for this task
TASK_DIR=".artifacts/$TASK_ID"
mkdir -p "$TASK_DIR"

# Copy commitment and claim to task directory
cp "$COMMITMENT_FILE" "$TASK_DIR/commitment.json"
if [ -f "$CLAIM_FILE" ]; then
    cp "$CLAIM_FILE" "$TASK_DIR/claim.json"
else
    # Create empty claim if none provided
    echo '{"task_id":"'$TASK_ID'","claimed":{}}' > "$TASK_DIR/claim.json"
fi

# Determine verification path based on task type
if [ "$TASK_TYPE" = "code" ] || [ "$PROFILE" = "code_update" ] || [ "$PROFILE" = "code_critical" ]; then
    echo "Running Phase 2: Code verification" >> "$LOG_FILE"

    # Run code adapters
    echo "Running diff analysis..." >> "$LOG_FILE"
    adapters/code/bin/adapter-code code:diff \
        --task-dir "$TASK_DIR" \
        --commitment "$TASK_DIR/commitment.json" \
        --claim "$TASK_DIR/claim.json" \
        --profile "$PROFILE_FILE" || true

    echo "Running lint check..." >> "$LOG_FILE"
    adapters/code/bin/adapter-code code:lint \
        --task-dir "$TASK_DIR" \
        --commitment "$TASK_DIR/commitment.json" \
        --claim "$TASK_DIR/claim.json" \
        --profile "$PROFILE_FILE" || true

    echo "Running tests..." >> "$LOG_FILE"
    adapters/code/bin/adapter-code code:tests \
        --task-dir "$TASK_DIR" \
        --commitment "$TASK_DIR/commitment.json" \
        --claim "$TASK_DIR/claim.json" \
        --profile "$PROFILE_FILE" || true

    echo "Running coverage..." >> "$LOG_FILE"
    adapters/code/bin/adapter-code code:coverage \
        --task-dir "$TASK_DIR" \
        --commitment "$TASK_DIR/commitment.json" \
        --claim "$TASK_DIR/claim.json" \
        --profile "$PROFILE_FILE" || true

    # Build artifacts index
    echo "Building artifacts index..." >> "$LOG_FILE"
    node tools/build-artifacts-index.mjs "$TASK_DIR" > "$TASK_DIR/artifacts.json"

    # Generate checksums
    find "$TASK_DIR" -type f ! -name checksums.sha256 -print0 | \
        xargs -0 sha256sum > "$TASK_DIR/checksums.sha256"

    # Create verdict with code verification results
    node -e "
    import { promises as fs } from 'fs';

    async function createVerdict() {
        const commitment = JSON.parse(await fs.readFile('$TASK_DIR/commitment.json', 'utf8'));
        const claim = JSON.parse(await fs.readFile('$TASK_DIR/claim.json', 'utf8'));
        const artifacts = JSON.parse(await fs.readFile('$TASK_DIR/artifacts.json', 'utf8'));

        // Load individual results
        let diffResult, lintResult, testResult, coverageResult;
        try { diffResult = JSON.parse(await fs.readFile('$TASK_DIR/diff.json', 'utf8')); } catch {}
        try { lintResult = JSON.parse(await fs.readFile('$TASK_DIR/lint.json', 'utf8')); } catch {}
        try { testResult = JSON.parse(await fs.readFile('$TASK_DIR/tests.json', 'utf8')); } catch {}
        try { coverageResult = JSON.parse(await fs.readFile('$TASK_DIR/coverage.json', 'utf8')); } catch {}

        // Check claim vs actual
        const units_expected = commitment.commitments?.expected_total || 0;
        const units_verified = diffResult?.total_changes || 0;

        // Determine status
        let status = 'pass';
        const reasons = [];

        if (units_verified < units_expected) {
            status = 'fail';
            reasons.push(\`Expected \${units_expected} changes, found \${units_verified}\`);
        }

        if (lintResult && lintResult.exitCode > 0) {
            status = 'fail';
            reasons.push(\`Lint failed with \${lintResult.errors || 0} errors\`);
        }

        if (testResult && testResult.failed > 0) {
            status = 'fail';
            reasons.push(\`\${testResult.failed} tests failed\`);
        }

        const verdict = {
            task_id: commitment.task_id,
            status: status,
            units_expected: units_expected,
            units_verified: units_verified,
            profile: commitment.profile || 'code_update',
            artifacts: artifacts,
            code_verification: {
                diff: diffResult,
                lint: lintResult,
                tests: testResult,
                coverage: coverageResult
            },
            reasons: reasons,
            timestamp: new Date().toISOString()
        };

        await fs.writeFile('$TASK_DIR/verdict.json', JSON.stringify(verdict, null, 2));
        await fs.writeFile('$VERDICT_FILE', JSON.stringify(verdict, null, 2));

        console.log('Code Verification Complete:');
        console.log('  Files changed:', diffResult?.total_changes || 0);
        console.log('  Lint:', lintResult ? (lintResult.exitCode === 0 ? 'PASS' : 'FAIL') : 'N/A');
        console.log('  Tests:', testResult ? \`\${testResult.passed}/\${testResult.total} passed\` : 'N/A');
        console.log('  Coverage:', coverageResult ? \`\${coverageResult.pct}%\` : 'N/A');
        console.log('  Overall:', status.toUpperCase());

        return verdict;
    }

    createVerdict().catch(console.error);
    " 2>&1 | tee -a "$LOG_FILE"

    # Enforce gate
    echo "Enforcing verification gate..." >> "$LOG_FILE"
    node tools/enforce-gate.mjs "$TASK_DIR/verdict.json" "$PROFILE_FILE" 2>&1 | tee -a "$LOG_FILE"
    GATE_EXIT=$?

    if [ $GATE_EXIT -ne 0 ]; then
        echo "❌ Code verification FAILED - gate requirements not met" | tee -a "$LOG_FILE"
        exit 1
    else
        echo "✅ Code verification PASSED" | tee -a "$LOG_FILE"
    fi

else
    # Fall back to Phase 1 content verification
    echo "Running Phase 1: Content verification" >> "$LOG_FILE"

    node -e "
    import { ContentAdapter } from './src/adapters/content.mjs';
    import { promises as fs } from 'fs';

    async function verify() {
        const commitment = $COMMITMENT;
        let claim = {};

        try {
            const claimData = await fs.readFile('$CLAIM_FILE', 'utf8');
            claim = JSON.parse(claimData);
        } catch (e) {
            claim = {
                task_id: commitment.task_id,
                claimed: { type: 'unknown', units_total: 0, units_list: [] }
            };
        }

        const adapter = new ContentAdapter();
        const targetDir = commitment.commitments.scope?.target_directory || 'testblog';
        const artifacts = await adapter.collectArtifacts(targetDir);
        const verification = await adapter.verify(commitment, claim, artifacts);

        const verdict = {
            task_id: commitment.task_id,
            status: verification.units_verified >= commitment.commitments.expected_total ? 'pass' : 'fail',
            units_expected: commitment.commitments.expected_total,
            units_verified: verification.units_verified,
            per_unit: verification.per_unit,
            reasons: verification.reasons,
            metrics: verification.metrics,
            policy: {
                profile: commitment.profile,
                thresholds: { word_min: commitment.commitments.quality?.word_min || 0 }
            },
            timestamp: new Date().toISOString()
        };

        await fs.writeFile('$VERDICT_FILE', JSON.stringify(verdict, null, 2));
        await fs.writeFile('$TASK_DIR/verdict.json', JSON.stringify(verdict, null, 2));

        console.log('Content Verification Complete:');
        console.log('  Status:', verdict.status);
        console.log('  Expected:', verdict.units_expected);
        console.log('  Verified:', verdict.units_verified);

        if (verdict.status === 'fail') {
            console.error('❌ Verification FAILED:', verdict.reasons.join(', '));
            process.exit(1);
        } else {
            console.log('✅ Verification PASSED');
        }
    }

    verify().catch(console.error);
    " 2>&1 | tee -a "$LOG_FILE"
fi

# Send verdict to monitoring server if available
if [ -f "$VERDICT_FILE" ]; then
    curl -X POST http://localhost:4000/api/verdict \
        -H "Content-Type: application/json" \
        -d @"$VERDICT_FILE" \
        --silent --output /dev/null || true
fi