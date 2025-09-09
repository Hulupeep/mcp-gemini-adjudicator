#!/bin/bash
# .claude/hooks/run_verification_direct.sh
# Direct Gemini API integration - bypasses MCP for automatic verification

set -e

# --- CONFIGURATION ---
HOOK_DIR="/home/xanacan/Dropbox/code/gemini_consensus/.claude/hooks"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"
MONITOR_URL="http://localhost:4000/log"
ENV_FILE="/home/xanacan/Dropbox/code/gemini_consensus/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^GEMINI_API_KEY=" "$ENV_FILE" | xargs)
    export $(grep -E "^GEMINI_MODEL=" "$ENV_FILE" | xargs)
fi

# Fallback to defaults
GEMINI_MODEL=${GEMINI_MODEL:-"gemini-2.5-flash-lite"}
GEMINI_API_URL="https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent"

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] PostToolUse: Running direct Gemini verification" >> $LOG_FILE

# --- READ INPUT ---
input_json=$(cat)
echo "Received input: $input_json" >> $LOG_FILE
file_path=$(echo "$input_json" | jq -r '.tool_input.file_path // .tool_input.files[0] // .tool_input.path')

if [ -z "$file_path" ] || [ "$file_path" == "null" ]; then
    echo "No file path found. Skipping verification." >> $LOG_FILE
    exit 0
fi

# --- TASK & ATTEMPT TRACKING ---
TASK_ID=$(basename "$file_path")
ATTEMPT_FILE="$HOOK_DIR/attempt_counts/${TASK_ID}.txt"
mkdir -p "$HOOK_DIR/attempt_counts"
touch "$ATTEMPT_FILE"
ATTEMPT_NUM=$(($(cat "$ATTEMPT_FILE" 2>/dev/null || echo 0) + 1))
echo $ATTEMPT_NUM > "$ATTEMPT_FILE"

# --- CHECK FOR API KEY ---
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" == "your_gemini_api_key_here" ]; then
    echo "GEMINI_API_KEY not configured. Skipping verification." >> $LOG_FILE
    curl -s -X POST -H "Content-Type: application/json" \
         -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"SKIPPED\", \"feedback\": \"Gemini API key not configured\", \"worker\": \"Claude\", \"adjudicator\": \"N/A\"}" \
         $MONITOR_URL > /dev/null 2>&1 || true
    exit 0
fi

# --- READ VERIFICATION DATA ---
if [ ! -f "$VERIFICATION_PROMPT_FILE" ]; then
    echo "No verification criteria. Skipping." >> $LOG_FILE
    curl -s -X POST -H "Content-Type: application/json" \
         -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"SKIPPED\", \"feedback\": \"No verification criteria available\", \"worker\": \"Claude\", \"adjudicator\": \"N/A\"}" \
         $MONITOR_URL > /dev/null 2>&1 || true
    exit 0
fi

verification_prompt=$(cat "$VERIFICATION_PROMPT_FILE")

# Read file content (handle binary files gracefully)
if file --mime-type "$file_path" | grep -q "text/"; then
    artifact_content=$(cat "$file_path" 2>/dev/null || echo "Error reading file")
else
    artifact_content="[Binary file - content not shown]"
fi

# --- BUILD GEMINI REQUEST ---
verification_request=$(cat <<EOF
You are an AI adjudicator verifying if a task has been completed correctly.

VERIFICATION CRITERIA:
$verification_prompt

FILE BEING VERIFIED: $file_path

CONTENT TO VERIFY:
\`\`\`
$artifact_content
\`\`\`

Analyze if ALL criteria have been met. Respond with a JSON verdict:
{
  "verdict": "PASS" or "FAIL",
  "confidence": 0.0 to 1.0,
  "analysis": {
    "criteria_met": ["list of met criteria"],
    "criteria_not_met": ["list of unmet criteria"]
  },
  "recommendations": ["specific fixes needed"],
  "detailed_feedback": "Clear explanation of what's missing or what passed"
}

Be strict - ALL criteria must be met for a PASS verdict.
EOF
)

# Escape the content for JSON
json_content=$(echo "$verification_request" | jq -R -s '.')

# --- CALL GEMINI API DIRECTLY ---
echo "Calling Gemini API for verification..." >> $LOG_FILE

response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{
      \"contents\": [{
        \"parts\": [{
          \"text\": $json_content
        }]
      }],
      \"generationConfig\": {
        \"temperature\": 0.1,
        \"maxOutputTokens\": 1024,
        \"responseMimeType\": \"application/json\"
      }
    }" \
    "$GEMINI_API_URL?key=$GEMINI_API_KEY" 2>/dev/null)

# --- PARSE RESPONSE ---
if [ -z "$response" ]; then
    echo "Empty response from Gemini API" >> $LOG_FILE
    curl -s -X POST -H "Content-Type: application/json" \
         -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"ERROR\", \"feedback\": \"Failed to get response from Gemini\", \"worker\": \"Claude\", \"adjudicator\": \"Gemini\"}" \
         $MONITOR_URL > /dev/null 2>&1 || true
    exit 0
fi

# Extract the JSON verdict from Gemini's response
verdict_json=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text' 2>/dev/null || echo "{}")

# Parse verdict components
verdict=$(echo "$verdict_json" | jq -r '.verdict // "FAIL"' 2>/dev/null || echo "FAIL")
confidence=$(echo "$verdict_json" | jq -r '.confidence // 0.5' 2>/dev/null || echo "0.5")
feedback=$(echo "$verdict_json" | jq -r '.detailed_feedback // "Unable to parse response"' 2>/dev/null || echo "Unable to parse response")

echo "Gemini verdict: $verdict (confidence: $confidence)" >> $LOG_FILE
echo "Feedback: $feedback" >> $LOG_FILE

# --- SEND TO MONITOR ---
json_feedback=$(echo "$feedback" | jq -R -s '.')
curl -s -X POST -H "Content-Type: application/json" \
     -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"$verdict\", \"feedback\": $json_feedback, \"confidence\": $confidence, \"worker\": \"Claude\", \"adjudicator\": \"Gemini\"}" \
     $MONITOR_URL > /dev/null 2>&1 || true

# --- PROVIDE FEEDBACK TO CLAUDE ---
if [ "$verdict" == "FAIL" ]; then
    echo "⚠️ Verification FAILED. Gemini says: $feedback" >> $LOG_FILE
    # Return feedback to Claude so it knows what to fix
    echo "⚠️ Automatic verification detected issues:"
    echo "$feedback"
    echo ""
    echo "Please address these issues and try again."
    # Don't exit with error - just provide feedback
else
    echo "✅ Verification PASSED!" >> $LOG_FILE
    # Clean up on success
    rm -f "$VERIFICATION_PROMPT_FILE"
    rm -f "$ATTEMPT_FILE"
    echo "✅ Verification passed! All criteria met."
fi

exit 0