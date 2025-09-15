#!/bin/bash

# Post-task hook v2: Runtime adapter discovery and execution
# Uses manifest-based capability resolution

set -e

LOG_FILE=".claude/hooks/verification.log"
COMMITMENT_FILE=".claude/verification/commitment.json"
CLAIM_FILE=".claude/verification/claim.json"
VERDICT_FILE=".claude/verification/verdict.json"

echo "[$(date)] Post-task claim extraction v2" >> "$LOG_FILE"

# Get tool input from stdin
TOOL_INPUT=$(cat)

# Pass through the original input immediately
echo "$TOOL_INPUT"

# Check if commitment exists
if [ ! -f "$COMMITMENT_FILE" ]; then
    echo "WARNING: No commitment file found" >> "$LOG_FILE"
    exit 0
fi

# Extract task info
TASK_ID=$(jq -r '.task_id' "$COMMITMENT_FILE")
TYPE=$(jq -r '.type // empty' "$COMMITMENT_FILE")

# Fallback to claim type if commitment doesn't have type
if [ -z "$TYPE" ] && [ -f "$CLAIM_FILE" ]; then
    TYPE=$(jq -r '.claim.type // .claimed.type // empty' "$CLAIM_FILE")
fi

# Final fallback to autodetect
if [ -z "$TYPE" ]; then
    # Simple autodetection logic
    if git diff --quiet 2>/dev/null; then
        TYPE="content"  # No git changes, probably content creation
    else
        TYPE="code"  # Git changes detected
    fi
fi

echo "Task $TASK_ID type: $TYPE" >> "$LOG_FILE"

# Create task directory for artifacts
TASK_DIR=".artifacts/$TASK_ID"
mkdir -p "$TASK_DIR"

# Copy commitment and claim to task directory
cp "$COMMITMENT_FILE" "$TASK_DIR/commitment.json"
[ -f "$CLAIM_FILE" ] && cp "$CLAIM_FILE" "$TASK_DIR/claim.json"

# Get execution plan for this type
PLAN=$(jq -r --arg t "$TYPE" '.[$t].order[]? // empty' config/adapter-plan.json)

if [ -z "$PLAN" ]; then
    echo "NO_PLAN_FOR_TYPE:$TYPE" >> "$LOG_FILE"
    echo "{
        \"task_id\": \"$TASK_ID\",
        \"status\": \"error\",
        \"error\": \"NO_PLAN_FOR_TYPE:$TYPE\",
        \"timestamp\": \"$(date -Iseconds)\"
    }" > "$VERDICT_FILE"
    exit 1
fi

echo "Execution plan for $TYPE: $PLAN" >> "$LOG_FILE"

# Execute each capability in the plan
ARTIFACTS_COLLECTED=()
for CAP in $PLAN; do
    echo "Resolving capability: $CAP" >> "$LOG_FILE"

    # Resolve adapter binary for this capability
    BIN=$(node tools/resolve-adapter.js "$CAP" 2>&1) || {
        # Check if this capability is required
        REQ=$(jq -r --arg t "$TYPE" --arg c "$CAP" '(.[$t].required // []) | index($c)' config/adapter-plan.json)

        if [ "$REQ" != "null" ]; then
            echo "MISSING_ADAPTER:$CAP (required)" >> "$LOG_FILE"
            echo "{
                \"task_id\": \"$TASK_ID\",
                \"status\": \"error\",
                \"error\": \"MISSING_ADAPTER:$CAP\",
                \"timestamp\": \"$(date -Iseconds)\"
            }" > "$VERDICT_FILE"
            exit 2
        else
            echo "Skipping optional capability: $CAP" >> "$LOG_FILE"
            continue
        fi
    }

    echo "Executing: $BIN $CAP" >> "$LOG_FILE"

    # Execute adapter with standard CLI
    "$BIN" "$CAP" \
        --task-dir "$TASK_DIR" \
        --commitment "$TASK_DIR/commitment.json" \
        --claim "$TASK_DIR/claim.json" \
        --profile "config/verification.profiles.json" \
        2>&1 | tee -a "$LOG_FILE" || {
            echo "ADAPTER_CRASH:$CAP" >> "$LOG_FILE"
            # Continue with other adapters even if one fails
        }

    # Collect any artifacts produced
    ARTIFACT_FILE="$TASK_DIR/${CAP//:/_}.json"
    [ -f "$ARTIFACT_FILE" ] && ARTIFACTS_COLLECTED+=("$ARTIFACT_FILE")
done

# Build consolidated artifacts.json
echo "Building artifacts.json from: ${ARTIFACTS_COLLECTED[@]}" >> "$LOG_FILE"
echo "{\"task_id\": \"$TASK_ID\", \"artifacts\": [" > "$TASK_DIR/artifacts.json"
for i in "${!ARTIFACTS_COLLECTED[@]}"; do
    if [ $i -gt 0 ]; then echo "," >> "$TASK_DIR/artifacts.json"; fi
    cat "${ARTIFACTS_COLLECTED[$i]}" >> "$TASK_DIR/artifacts.json"
done
echo "]}" >> "$TASK_DIR/artifacts.json"

# Run fast gate enforcement (deterministic rules)
if [ -f "tools/enforce-gate.mjs" ]; then
    echo "Running fast gate enforcement" >> "$LOG_FILE"
    node tools/enforce-gate.mjs \
        "$TASK_DIR/artifacts.json" \
        "config/verification.profiles.json" \
        --dry-run \
        > "$TASK_DIR/quick_verdict.json" 2>> "$LOG_FILE"

    # Check if we got a conclusive verdict
    if jq -e '.status=="pass" or .status=="fail"' "$TASK_DIR/quick_verdict.json" >/dev/null 2>&1; then
        echo "Fast verdict: $(jq -r '.status' "$TASK_DIR/quick_verdict.json")" >> "$LOG_FILE"
        cp "$TASK_DIR/quick_verdict.json" "$VERDICT_FILE"
    else
        echo "Inconclusive fast verdict, would call Gemini here" >> "$LOG_FILE"
        # For now, use the quick verdict as final
        cp "$TASK_DIR/quick_verdict.json" "$VERDICT_FILE"
    fi
else
    # Fallback: simple pass/fail based on artifact collection
    echo "No gate enforcer, using simple verdict" >> "$LOG_FILE"

    EXPECTED=$(jq -r '.commitments.expected_total // 0' "$COMMITMENT_FILE")
    VERIFIED=$(ls -1 "$TASK_DIR"/*.json 2>/dev/null | wc -l)

    STATUS="fail"
    [ "$VERIFIED" -ge "$EXPECTED" ] && STATUS="pass"

    echo "{
        \"task_id\": \"$TASK_ID\",
        \"status\": \"$STATUS\",
        \"units_expected\": $EXPECTED,
        \"units_verified\": $VERIFIED,
        \"timestamp\": \"$(date -Iseconds)\"
    }" > "$VERDICT_FILE"
fi

# Send verdict to monitoring server
if [ -f "$VERDICT_FILE" ]; then
    curl -X POST http://localhost:4000/api/verdict \
        -H "Content-Type: application/json" \
        -d @"$VERDICT_FILE" \
        --silent --output /dev/null || true
fi

# Enforce the gate
STATUS=$(jq -r '.status' "$VERDICT_FILE")
echo "Final verdict: $STATUS" >> "$LOG_FILE"

if [ "$STATUS" = "fail" ]; then
    echo "❌ Verification FAILED" >&2
    exit 1
else
    echo "✅ Verification PASSED"
fi