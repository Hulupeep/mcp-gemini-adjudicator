#!/bin/bash

# Post-task hook: Extract CLAIM JSON and run verification per PRD v2
# Expects Claude to output structured CLAIM JSON

set -e

LOG_FILE=".claude/hooks/verification.log"
COMMITMENT_FILE=".claude/verification/commitment.json"
CLAIM_FILE=".claude/verification/claim.json"
VERDICT_FILE=".claude/verification/verdict.json"

echo "[$(date)] Post-task claim extraction" >> "$LOG_FILE"

# Get tool input from stdin
TOOL_INPUT=$(cat)

# Pass through the original input immediately
echo "$TOOL_INPUT"

# Try to extract CLAIM JSON from Claude's output
# Look for JSON block in the tool input or recent outputs
CLAIM_JSON=""

# Check if there's a claim.json file created by Claude
if [ -f "$CLAIM_FILE" ]; then
    CLAIM_JSON=$(cat "$CLAIM_FILE")
    echo "Found claim file" >> "$LOG_FILE"
else
    # Try to extract from tool input (if Claude included it)
    if echo "$TOOL_INPUT" | grep -q '"claimed"'; then
        CLAIM_JSON=$(echo "$TOOL_INPUT" | grep -A 20 '"claimed"' | head -20)
        echo "Extracted claim from tool input" >> "$LOG_FILE"
    fi
fi

# Load commitment
if [ ! -f "$COMMITMENT_FILE" ]; then
    echo "WARNING: No commitment file found" >> "$LOG_FILE"
    exit 0
fi

COMMITMENT=$(cat "$COMMITMENT_FILE")
TASK_ID=$(echo "$COMMITMENT" | jq -r '.task_id')
TASK_TYPE=$(echo "$COMMITMENT" | jq -r '.type')
EXPECTED_TOTAL=$(echo "$COMMITMENT" | jq -r '.commitments.expected_total')

echo "Verifying task $TASK_ID: expected=$EXPECTED_TOTAL, type=$TASK_TYPE" >> "$LOG_FILE"

# Run verification using content adapter
node -e "
import { ContentAdapter } from './src/adapters/content.mjs';
import { promises as fs } from 'fs';

async function verify() {
    const commitment = $COMMITMENT;

    // Try to load claim if it exists
    let claim = {};
    try {
        const claimData = await fs.readFile('$CLAIM_FILE', 'utf8');
        claim = JSON.parse(claimData);
    } catch (e) {
        console.log('No claim JSON found - auto-fail');
        claim = {
            task_id: commitment.task_id,
            claimed: {
                type: 'unknown',
                units_total: 0,
                units_list: []
            }
        };
    }

    // Collect artifacts
    const adapter = new ContentAdapter();
    const targetDir = commitment.commitments.scope.target_directory || 'testblog';
    const artifacts = await adapter.collectArtifacts(targetDir);

    // Run verification
    const verification = await adapter.verify(commitment, claim, artifacts);

    // Create verdict
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
            thresholds: { word_min: commitment.commitments.quality.word_min }
        },
        timestamp: new Date().toISOString()
    };

    // Save verdict
    await fs.writeFile('$VERDICT_FILE', JSON.stringify(verdict, null, 2));

    // Send to monitoring server
    try {
        const response = await fetch('http://localhost:4000/api/verdict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(verdict)
        });
    } catch (e) {
        // Ignore if monitoring server not running
    }

    console.log('Verification complete:');
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