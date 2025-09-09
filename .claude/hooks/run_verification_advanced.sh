#!/bin/bash
# Advanced verification hook with JSON output for better Claude integration
# This version uses JSON output to control Claude's behavior more precisely

set -e

# --- CONFIGURATION ---
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$HOOK_DIR/../.." && pwd)"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"
MONITOR_URL="http://localhost:4000/log"
ENV_FILE="$PROJECT_DIR/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^GEMINI_API_KEY=" "$ENV_FILE" | xargs)
fi

GEMINI_MODEL="gemini-2.5-flash-lite"
GEMINI_API_URL="https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent"

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] PostToolUse: Running advanced verification" >> $LOG_FILE

# --- READ INPUT ---
input_json=$(cat)
echo "Received input: $input_json" >> $LOG_FILE
file_path=$(echo "$input_json" | jq -r '.tool_input.file_path // .tool_input.files[0] // .tool_input.path')

if [ -z "$file_path" ] || [ "$file_path" == "null" ]; then
    echo "No file path found. Skipping." >> $LOG_FILE
    exit 0
fi

# --- TASK TRACKING ---
TASK_ID=$(basename "$file_path")
ATTEMPT_FILE="$HOOK_DIR/attempt_counts/${TASK_ID}.txt"
mkdir -p "$HOOK_DIR/attempt_counts"
ATTEMPT_NUM=$(($(cat "$ATTEMPT_FILE" 2>/dev/null || echo 0) + 1))
echo $ATTEMPT_NUM > "$ATTEMPT_FILE"

# --- CHECK API KEY ---
if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" == "your_gemini_api_key_here" ]; then
    echo "API key not configured. Skipping." >> $LOG_FILE
    exit 0
fi

# --- READ VERIFICATION CRITERIA ---
if [ ! -f "$VERIFICATION_PROMPT_FILE" ]; then
    echo "No verification criteria. Skipping." >> $LOG_FILE
    exit 0
fi

verification_prompt=$(cat "$VERIFICATION_PROMPT_FILE")

# Read file content (limit size for large files)
# Check if file command exists, otherwise use basic extension check
if command -v file >/dev/null 2>&1 && file --mime-type "$file_path" 2>/dev/null | grep -q "text/"; then
    IS_TEXT=true
elif [[ "$file_path" =~ \.(txt|js|py|sh|json|md|html|htm|css|xml|yaml|yml|conf|cfg|log)$ ]]; then
    IS_TEXT=true
else
    IS_TEXT=false
fi

if [ "$IS_TEXT" = true ]; then
    # For HTML files, just extract a relevant snippet around the change
    if [[ "$file_path" =~ \.(html|htm)$ ]]; then
        # Try to get context from tool_input
        new_content=$(echo "$input_json" | jq -r '.tool_input.new_string // ""' 2>/dev/null)
        if [ ! -z "$new_content" ] && [ "$new_content" != "null" ]; then
            file_content="[HTML file - showing changed content only]
$new_content"
        else
            # Fallback: Get first 5000 chars
            file_content=$(head -c 5000 "$file_path" 2>/dev/null || echo "Error reading file")
            file_content="[Truncated HTML - first 5000 chars]
$file_content"
        fi
    else
        # For other text files, read normally but limit to 50KB
        file_content=$(head -c 50000 "$file_path" 2>/dev/null || echo "Error reading file")
    fi
else
    file_content="[Binary file]"
fi

# --- BUILD GEMINI REQUEST ---
verification_request=$(cat <<EOF
You are an AI adjudicator verifying if a task has been completed correctly.

VERIFICATION CRITERIA:
$verification_prompt

FILE BEING VERIFIED: $file_path

CONTENT TO VERIFY:
\`\`\`
$file_content
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

# Escape for JSON
json_content=$(echo "$verification_request" | jq -R -s '.')

# --- CALL GEMINI API ---
echo "Calling Gemini API..." >> $LOG_FILE

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
        \"maxOutputTokens\": 1024
      }
    }" \
    "$GEMINI_API_URL?key=$GEMINI_API_KEY" 2>/dev/null)

# --- PARSE RESPONSE ---
if [ -z "$response" ]; then
    echo "Empty response from Gemini" >> $LOG_FILE
    exit 0
fi

# Extract verdict
verdict_json=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text' 2>/dev/null || echo "{}")
verdict=$(echo "$verdict_json" | jq -r '.verdict // "FAIL"' 2>/dev/null || echo "FAIL")
confidence=$(echo "$verdict_json" | jq -r '.confidence // 0.5' 2>/dev/null || echo "0.5")
feedback=$(echo "$verdict_json" | jq -r '.detailed_feedback // "Unable to parse response"' 2>/dev/null || echo "Unable to parse response")
recommendations=$(echo "$verdict_json" | jq -r '.recommendations[]' 2>/dev/null | head -5)

echo "Verdict: $verdict (confidence: $confidence)" >> $LOG_FILE

# --- SEND TO MONITOR ---
json_feedback=$(echo "$feedback" | jq -R -s '.')
curl -s -X POST -H "Content-Type: application/json" \
     -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"$verdict\", \"feedback\": $json_feedback, \"confidence\": $confidence, \"worker\": \"Claude\", \"adjudicator\": \"Gemini\"}" \
     $MONITOR_URL > /dev/null 2>&1 || true

# --- PROVIDE STRUCTURED FEEDBACK TO CLAUDE ---
if [ "$verdict" == "FAIL" ]; then
    echo "⚠️ Verification FAILED (Attempt $ATTEMPT_NUM)" >> $LOG_FILE
    
    # Build detailed feedback message
    feedback_message="Verification failed. The following issues need to be addressed:\n\n"
    feedback_message+="$feedback\n\n"
    
    if [ ! -z "$recommendations" ]; then
        feedback_message+="Specific fixes required:\n"
        while IFS= read -r rec; do
            feedback_message+="• $rec\n"
        done <<< "$recommendations"
    fi
    
    # Return JSON output for PostToolUse hook
    cat <<JSON
{
  "decision": "block",
  "reason": "$feedback_message",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Attempt $ATTEMPT_NUM failed verification. Please fix the issues and the file will be automatically re-verified."
  }
}
JSON
    
    # Exit 0 because we're using JSON output
    exit 0
else
    echo "✅ Verification PASSED after $ATTEMPT_NUM attempt(s)!" >> $LOG_FILE
    
    # Clean up on success
    rm -f "$VERIFICATION_PROMPT_FILE"
    rm -f "$ATTEMPT_FILE"
    
    # Return success JSON
    cat <<JSON
{
  "decision": undefined,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "✅ Verification passed! All criteria met after $ATTEMPT_NUM attempt(s)."
  }
}
JSON
    
    exit 0
fi