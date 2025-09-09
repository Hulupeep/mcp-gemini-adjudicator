#!/bin/bash
# .claude/hooks/run_verification.sh

# Exit on error
set -e

# --- CONFIGURATION ---
HOOK_DIR="/home/xanacan/Dropbox/code/gemini_consensus/.claude/hooks"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] PostToolUse: Running run_verification.sh" >> $LOG_FILE

# --- READ INPUT ---
# The hook receives JSON from stdin containing info about the tool call.
input_json=$(cat)
echo "Received input: $input_json" >> $LOG_FILE

# Extract the file path that was edited.
# This handles multiple file editing tools.
file_path=$(echo "$input_json" | jq -r '.tool_input.file_path // .tool_input.files[0]')

if [ -z "$file_path" ] || [ "$file_path" == "null" ]; then
    echo "No file path found in tool input. Skipping verification." >> $LOG_FILE
    exit 0
fi

# --- READ VERIFICATION DATA ---
if [ ! -f "$VERIFICATION_PROMPT_FILE" ]; then
    echo "Verification prompt file not found. Skipping." >> $LOG_FILE
    exit 0
fi

verification_prompt=$(cat "$VERIFICATION_PROMPT_FILE")
artifact_content=$(cat "$file_path")

# --- CALL ADJUDICATOR (PLACEHOLDER) ---
# In a real implementation, you would call your mcp-gemini-adjudicator tool here.
# This might be another shell command, a curl request, etc.
echo "Calling Gemini Adjudicator for file: $file_path" >> $LOG_FILE

# Simulate the call and a FAIL response for demonstration
adjudicator_response=$(cat <<EOF
{
  "verdict": "FAIL",
  "confidence": 0.95,
  "analysis": {
    "strengths": ["Most stories were updated correctly."],
    "weaknesses": ["Some stories are missing required elements."],
    "risks": ["Incomplete content deployment."]
  },
  "recommendations": ["Rerun the task with specific instructions to fix the missing elements."],
  "detailed_feedback": "Stories 2, 5, and 8 are missing the 'I want this savings' button. Story 5 is also missing the 'The flow to do this' section.",
  "test_coverage": {
    "scenarios_checked": ["All stories checked for 3 required sections"],
    "scenarios_missing": []
  },
  "citations": []
}
EOF
)

echo "Adjudicator response: $adjudicator_response" >> $LOG_FILE

# --- PROCESS VERDICT ---
verdict=$(echo "$adjudicator_response" | jq -r '.verdict')

if [ "$verdict" == "FAIL" ]; then
    echo "Verification FAILED. Feedback has been logged." >> $LOG_FILE
    # In a more advanced setup, you could use the feedback to prompt the user
    # or even automatically re-run the task with the corrective feedback.
    # For now, we just log it.
    # The hook can return a message to Claude by printing to stdout.
    feedback=$(echo "$adjudicator_response" | jq -r '.detailed_feedback')
    echo "Verification failed. The adjudicator reported: ${feedback}"
    exit 1 # Exit with an error to signal failure to the Claude Code environment
else
    echo "Verification PASSED for $file_path." >> $LOG_FILE
    # Clean up the prompt file on success
    rm $VERIFICATION_PROMPT_FILE
fi

exit 0
