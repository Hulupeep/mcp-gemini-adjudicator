#!/bin/bash
# .claude/hooks/run_verification.sh

# Exit on error
set -e

# --- CONFIGURATION ---
HOOK_DIR="/home/xanacan/Dropbox/code/gemini_consensus/.claude/hooks"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"
MONITOR_URL="http://localhost:4000/log"

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] PostToolUse: Running run_verification.sh" >> $LOG_FILE

# --- READ INPUT ---
input_json=$(cat)
echo "Received input: $input_json" >> $LOG_FILE
file_path=$(echo "$input_json" | jq -r '.tool_input.file_path // .tool_input.files[0]')

if [ -z "$file_path" ] || [ "$file_path" == "null" ]; then
    echo "No file path found in tool input. Skipping verification." >> $LOG_FILE
    exit 0
fi

# --- TASK & ATTEMPT TRACKING ---
TASK_ID=$(basename "$file_path") # Simple task ID from filename
ATTEMPT_FILE="$HOOK_DIR/attempt_counts/${TASK_ID}.txt"
mkdir -p "$HOOK_DIR/attempt_counts"
touch "$ATTEMPT_FILE"
ATTEMPT_NUM=$(($(cat "$ATTEMPT_FILE") + 1))
echo $ATTEMPT_NUM > "$ATTEMPT_FILE"

# --- READ VERIFICATION DATA ---
if [ ! -f "$VERIFICATION_PROMPT_FILE" ]; then
    echo "Verification prompt file not found. Skipping." >> $LOG_FILE
    # Send a 'SKIPPED' status to the monitor
    curl -s -X POST -H "Content-Type: application/json" \
         -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"SKIPPED\", \"feedback\": \"Verification prompt not found.\", \"worker\": \"Claude\", \"adjudicator\": \"N/A\"}" \
         $MONITOR_URL > /dev/null
    exit 0
fi

verification_prompt=$(cat "$VERIFICATION_PROMPT_FILE")
artifact_content=$(cat "$file_path")

# --- CALL ADJUDICATOR (PLACEHOLDER) ---
echo "Calling Gemini Adjudicator for file: $file_path" >> $LOG_FILE
adjudicator_response=$(cat <<EOF
{
  "verdict": "FAIL",
  "confidence": 0.95,
  "analysis": {},
  "recommendations": [],
  "detailed_feedback": "Stories 2, 5, and 8 are missing the 'I want this savings' button. Story 5 is also missing the 'The flow to do this' section."
}
EOF
)
echo "Adjudicator response: $adjudicator_response" >> $LOG_FILE

# --- PROCESS VERDICT & NOTIFY MONITOR ---
verdict=$(echo "$adjudicator_response" | jq -r '.verdict')
feedback=$(echo "$adjudicator_response" | jq -r '.detailed_feedback')

# Escape feedback for JSON
json_feedback=$(echo "$feedback" | jq -R -s '.')

# Send result to the monitoring server
curl -s -X POST -H "Content-Type: application/json" \
     -d "{\"taskId\": \"$TASK_ID\", \"attempt\": $ATTEMPT_NUM, \"status\": \"$verdict\", \"feedback\": $json_feedback, \"worker\": \"Claude\", \"adjudicator\": \"Gemini\"}" \
     $MONITOR_URL > /dev/null

# --- HANDLE FAILURE/SUCCESS ---
if [ "$verdict" == "FAIL" ]; then
    echo "Verification FAILED. Feedback has been logged and sent to monitor." >> $LOG_FILE
    # Return the feedback to Claude so it knows what to fix
    echo "Verification failed. The adjudicator reported: ${feedback}"
    exit 1
else
    echo "Verification PASSED for $file_path." >> $LOG_FILE
    # Clean up the prompt and attempt count on success
    rm "$VERIFICATION_PROMPT_FILE"
    rm "$ATTEMPT_FILE"
fi

exit 0
