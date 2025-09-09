#!/bin/bash
# Enhanced verification that catches partial task completion
# Prevents "shenanigans" like updating only 3 posts when asked for all 20

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

ENABLE_LOGGING="${ENABLE_VERIFICATION_LOGGING:-false}"
GEMINI_MODEL="gemini-2.5-flash-lite"
GEMINI_API_URL="https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent"

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] PostToolUse: Running completeness verification" >> $LOG_FILE

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
    exit 0
fi

verification_prompt=$(cat "$VERIFICATION_PROMPT_FILE")
echo "Found verification criteria with completeness checks" >> $LOG_FILE

# --- EXTRACT QUANTITY REQUIREMENTS ---
has_quantity_req=false
expected_count=""

if echo "$verification_prompt" | grep -i "ALL 20 blog posts" > /dev/null; then
    has_quantity_req=true
    expected_count="20"
    echo "Detected requirement: ALL 20 items must be updated" >> $LOG_FILE
elif echo "$verification_prompt" | grep -iE "ALL [0-9]+ " > /dev/null; then
    has_quantity_req=true
    expected_count=$(echo "$verification_prompt" | grep -oE "ALL [0-9]+" | grep -oE "[0-9]+" | head -1)
    echo "Detected requirement: ALL $expected_count items must be updated" >> $LOG_FILE
elif echo "$verification_prompt" | grep -i "ALL items" > /dev/null; then
    has_quantity_req=true
    echo "Detected requirement: ALL items must be updated" >> $LOG_FILE
fi

# --- READ FILE CONTENT ---
if command -v file >/dev/null 2>&1 && file --mime-type "$file_path" 2>/dev/null | grep -q "text/"; then
    IS_TEXT=true
elif [[ "$file_path" =~ \.(txt|js|py|sh|json|md|html|htm|css|xml|yaml|yml|conf|cfg|log)$ ]]; then
    IS_TEXT=true
else
    IS_TEXT=false
fi

if [ "$IS_TEXT" = true ]; then
    if [[ "$file_path" =~ \.(html|htm)$ ]]; then
        # For HTML, read more content to check completeness
        file_content=$(head -c 100000 "$file_path" 2>/dev/null || echo "Error reading file")
        
        # Count specific patterns if checking blog posts
        if [ "$has_quantity_req" = true ] && echo "$file_path" | grep -iE "(blog|post|index)" > /dev/null; then
            # Count blog post patterns
            blog_count=$(echo "$file_content" | grep -c '<h1.*Blog Post' || echo "0")
            format_count=$(echo "$file_content" | grep -c 'Cost Breakdown Before' || echo "0")
            story_count=$(echo "$file_content" | grep -c 'class="story-text"' || echo "0")
            
            file_content="[HTML Analysis]
Blog posts with H1 titles: $blog_count
Blog posts with correct format: $format_count
Blog posts with 400+ word stories: $story_count

[First 10000 chars of content]
${file_content:0:10000}"
        else
            file_content="[HTML file - first 10000 chars]
${file_content:0:10000}"
        fi
    else
        file_content=$(head -c 50000 "$file_path" 2>/dev/null || echo "Error reading file")
    fi
else
    file_content="[Binary file]"
fi

# --- BUILD ENHANCED GEMINI REQUEST ---
verification_request=$(cat <<EOF
You are a STRICT AI adjudicator verifying if a task has been COMPLETELY finished.
Pay special attention to quantity requirements and partial completion.

VERIFICATION CRITERIA:
$verification_prompt

FILE BEING VERIFIED: $file_path

CONTENT TO VERIFY:
\`\`\`
$file_content
\`\`\`

CRITICAL CHECKS:
1. If "ALL" items were requested, verify EVERY SINGLE ONE was updated
2. If a specific count was given (e.g., "20 blog posts"), count and verify the exact number
3. If a format was specified, verify ALL items follow it consistently
4. Partial completion (e.g., doing 3 out of 20) is a FAILURE
5. Saying "completed" without actually doing the work is a FAILURE

For blog posts specifically, check:
- Are ALL posts updated with the required format?
- Do ALL posts have the required sections (story, cost breakdown, etc.)?
- Are there any posts that were skipped or forgotten?

Respond with a JSON verdict:
{
  "verdict": "PASS" or "FAIL",
  "confidence": 0.0 to 1.0,
  "completeness_check": {
    "items_requested": "number or 'all'",
    "items_completed": "actual count",
    "items_skipped": "list of skipped items if any"
  },
  "analysis": {
    "criteria_met": ["list of met criteria"],
    "criteria_not_met": ["list of unmet criteria"]
  },
  "recommendations": ["specific fixes needed"],
  "detailed_feedback": "Clear explanation focusing on completeness"
}

Be VERY strict about completeness - if not ALL work is done, it's a FAIL.
EOF
)

# Escape for JSON
json_content=$(echo "$verification_request" | jq -R -s '.')

# --- CALL GEMINI API ---
echo "Calling Gemini API with completeness checks..." >> $LOG_FILE

if [ "$ENABLE_LOGGING" = "true" ]; then
    mkdir -p "$HOOK_DIR/logs"
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

if [ "$ENABLE_LOGGING" = "true" ]; then
    echo "$response" > "$HOOK_DIR/logs/last_gemini_response_$(date +%Y%m%d_%H%M%S).json"
fi

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

# Extract completeness info
items_requested=$(echo "$verdict_json" | jq -r '.completeness_check.items_requested // "unknown"' 2>/dev/null)
items_completed=$(echo "$verdict_json" | jq -r '.completeness_check.items_completed // "unknown"' 2>/dev/null)
items_skipped=$(echo "$verdict_json" | jq -r '.completeness_check.items_skipped[]' 2>/dev/null)

echo "Verdict: $verdict (confidence: $confidence)" >> $LOG_FILE
echo "Completeness: $items_completed / $items_requested" >> $LOG_FILE

# --- SEND TO MONITOR ---
json_feedback=$(echo "$feedback" | jq -R -s '.')
curl -s -X POST -H "Content-Type: application/json" \
     -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"$verdict\", \"feedback\": $json_feedback, \"confidence\": $confidence, \"worker\": \"Claude\", \"adjudicator\": \"Gemini\", \"completeness\": \"$items_completed/$items_requested\"}" \
     $MONITOR_URL > /dev/null 2>&1 || true

# --- PROVIDE ENHANCED FEEDBACK ---
if [ "$verdict" == "FAIL" ]; then
    echo "⚠️ Verification FAILED (Attempt $ATTEMPT_NUM)" >> $LOG_FILE
    
    # Build detailed feedback message
    feedback_message="❌ INCOMPLETE WORK DETECTED!\n\n"
    
    if [ "$items_requested" != "unknown" ] && [ "$items_completed" != "unknown" ]; then
        feedback_message+="📊 Completeness Check:\n"
        feedback_message+="  • Requested: $items_requested items\n"
        feedback_message+="  • Completed: $items_completed items\n"
        
        if [ ! -z "$items_skipped" ]; then
            feedback_message+="\n⚠️ Items skipped or incomplete:\n"
            while IFS= read -r item; do
                feedback_message+="  • $item\n"
            done <<< "$items_skipped"
        fi
        feedback_message+="\n"
    fi
    
    feedback_message+="$feedback\n\n"
    
    if [ ! -z "$recommendations" ]; then
        feedback_message+="📝 Required Actions:\n"
        while IFS= read -r rec; do
            feedback_message+="  • $rec\n"
        done <<< "$recommendations"
    fi
    
    feedback_message+="\n⚠️ IMPORTANT: Complete ALL work, not just part of it!"
    
    # Return JSON output for PostToolUse hook
    cat <<JSON
{
  "decision": "block",
  "reason": "$feedback_message",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Attempt $ATTEMPT_NUM: INCOMPLETE WORK - only $items_completed of $items_requested done. Complete ALL items!"
  }
}
JSON
    
    exit 0
else
    echo "✅ Verification PASSED - All work completed!" >> $LOG_FILE
    
    # Clean up on success
    rm -f "$VERIFICATION_PROMPT_FILE"
    rm -f "$ATTEMPT_FILE"
    
    # Return success JSON
    cat <<JSON
{
  "decision": undefined,
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "✅ COMPLETE! All $items_requested items verified after $ATTEMPT_NUM attempt(s)."
  }
}
JSON
    
    exit 0
fi