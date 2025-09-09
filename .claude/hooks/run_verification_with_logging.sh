#!/bin/bash
# Enhanced verification hook with comprehensive Gemini API logging
# Logs all requests and responses for debugging

set -e

# --- CONFIGURATION ---
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$HOOK_DIR/../.." && pwd)"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
GEMINI_LOG_FILE="$HOOK_DIR/gemini_log.json"
LOG_FILE="$HOOK_DIR/hooks.log"
MONITOR_URL="http://localhost:4000/log"
ENV_FILE="$PROJECT_DIR/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^GEMINI_API_KEY=" "$ENV_FILE" | xargs)
    export $(grep -E "^ENABLE_VERIFICATION_LOGGING=" "$ENV_FILE" | xargs) 2>/dev/null || true
fi

# Check if logging is enabled (default: off)
ENABLE_LOGGING="${ENABLE_VERIFICATION_LOGGING:-false}"

GEMINI_MODEL="gemini-2.5-flash-lite"
GEMINI_API_URL="https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent"

# --- INITIALIZE LOGS ---
mkdir -p "$HOOK_DIR/logs"
touch "$GEMINI_LOG_FILE"

# --- LOGGING FUNCTION ---
log_gemini() {
    # Only log if logging is enabled
    if [ "$ENABLE_LOGGING" != "true" ]; then
        return
    fi
    
    local entry=$1
    
    # Read existing JSON array or create new one
    if [ -f "$GEMINI_LOG_FILE" ] && [ -s "$GEMINI_LOG_FILE" ]; then
        existing=$(cat "$GEMINI_LOG_FILE")
    else
        existing="[]"
    fi
    
    # Add new entry and limit to last 20
    updated=$(echo "$existing" | jq --argjson new "$entry" '. += [$new] | .[-20:]')
    echo "$updated" > "$GEMINI_LOG_FILE"
}

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] PostToolUse: Running verification with logging" >> $LOG_FILE

# --- READ INPUT ---
input_json=$(cat)
timestamp=$(date -Iseconds)
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
    
    # Log this skip event
    skip_entry=$(jq -n \
        --arg time "$timestamp" \
        --arg file "$file_path" \
        --arg reason "No verification criteria file" \
        '{
            timestamp: $time,
            event: "verification_skipped",
            file_path: $file,
            reason: $reason,
            attempt: 0
        }')
    log_gemini "$skip_entry"
    
    exit 0
fi

verification_prompt=$(cat "$VERIFICATION_PROMPT_FILE")
echo "Found verification criteria" >> $LOG_FILE

# --- READ FILE CONTENT ---
# Check if file command exists, otherwise use basic extension check
if command -v file >/dev/null 2>&1 && file --mime-type "$file_path" 2>/dev/null | grep -q "text/"; then
    IS_TEXT=true
elif [[ "$file_path" =~ \.(txt|js|py|sh|json|md|html|htm|css|xml|yaml|yml|conf|cfg|log)$ ]]; then
    IS_TEXT=true
else
    IS_TEXT=false
fi

if [ "$IS_TEXT" = true ]; then
    # For HTML files, just extract a relevant snippet
    if [[ "$file_path" =~ \.(html|htm)$ ]]; then
        # Try to get context from tool_input
        new_content=$(echo "$input_json" | jq -r '.tool_input.new_string // ""' 2>/dev/null)
        if [ ! -z "$new_content" ] && [ "$new_content" != "null" ]; then
            file_content="[HTML file - showing changed content only]
$new_content"
            content_source="edit_operation"
        else
            # Fallback: Get first 5000 chars
            file_content=$(head -c 5000 "$file_path" 2>/dev/null || echo "Error reading file")
            file_content="[Truncated HTML - first 5000 chars]
$file_content"
            content_source="file_preview"
        fi
    else
        # For other text files, read normally but limit to 50KB
        file_content=$(head -c 50000 "$file_path" 2>/dev/null || echo "Error reading file")
        content_source="full_file"
    fi
else
    file_content="[Binary file]"
    content_source="binary"
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

# --- LOG REQUEST ---
request_entry=$(jq -n \
    --arg time "$timestamp" \
    --arg file "$file_path" \
    --arg prompt "$verification_prompt" \
    --arg content "${file_content:0:500}" \
    --arg source "$content_source" \
    --argjson attempt "$ATTEMPT_NUM" \
    '{
        timestamp: $time,
        event: "gemini_request",
        file_path: $file,
        attempt: $attempt,
        content_source: $source,
        verification_prompt_snippet: ($prompt | .[0:200]),
        file_content_snippet: $content,
        full_prompt_length: ($prompt | length)
    }')
log_gemini "$request_entry"

# --- CALL GEMINI API ---
echo "Calling Gemini API..." >> $LOG_FILE

# Save request for debugging (only if logging enabled)
if [ "$ENABLE_LOGGING" = "true" ]; then
    echo "$verification_request" > "$HOOK_DIR/logs/last_gemini_request_$(date +%Y%m%d_%H%M%S).txt"
fi

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

# Save response for debugging (only if logging enabled)
if [ "$ENABLE_LOGGING" = "true" ]; then
    echo "$response" > "$HOOK_DIR/logs/last_gemini_response_$(date +%Y%m%d_%H%M%S).json"
fi

# --- PARSE RESPONSE ---
if [ -z "$response" ]; then
    echo "Empty response from Gemini" >> $LOG_FILE
    
    # Log error
    error_entry=$(jq -n \
        --arg time "$timestamp" \
        --arg file "$file_path" \
        --argjson attempt "$ATTEMPT_NUM" \
        '{
            timestamp: $time,
            event: "gemini_error",
            file_path: $file,
            attempt: $attempt,
            error: "Empty response from API"
        }')
    log_gemini "$error_entry"
    
    exit 0
fi

# Extract verdict
verdict_json=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text' 2>/dev/null || echo "{}")
verdict=$(echo "$verdict_json" | jq -r '.verdict // "FAIL"' 2>/dev/null || echo "FAIL")
confidence=$(echo "$verdict_json" | jq -r '.confidence // 0.5' 2>/dev/null || echo "0.5")
feedback=$(echo "$verdict_json" | jq -r '.detailed_feedback // "Unable to parse response"' 2>/dev/null || echo "Unable to parse response")
recommendations=$(echo "$verdict_json" | jq -r '.recommendations[]' 2>/dev/null | head -5)
criteria_met=$(echo "$verdict_json" | jq -r '.analysis.criteria_met[]' 2>/dev/null)
criteria_not_met=$(echo "$verdict_json" | jq -r '.analysis.criteria_not_met[]' 2>/dev/null)

echo "Verdict: $verdict (confidence: $confidence)" >> $LOG_FILE

# --- LOG RESPONSE ---
response_entry=$(jq -n \
    --arg time "$timestamp" \
    --arg file "$file_path" \
    --arg verdict "$verdict" \
    --arg confidence "$confidence" \
    --arg feedback "$feedback" \
    --arg met "$criteria_met" \
    --arg not_met "$criteria_not_met" \
    --argjson attempt "$ATTEMPT_NUM" \
    '{
        timestamp: $time,
        event: "gemini_response",
        file_path: $file,
        attempt: $attempt,
        verdict: $verdict,
        confidence: ($confidence | tonumber),
        feedback: $feedback,
        criteria_met: ($met | split("\n") | map(select(. != ""))),
        criteria_not_met: ($not_met | split("\n") | map(select(. != "")))
    }')
log_gemini "$response_entry"

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