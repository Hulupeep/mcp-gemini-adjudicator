#!/bin/bash
# .claude/hooks/generate_verification_prompt.sh

# Exit on error
set -e

# --- CONFIGURATION ---
# Use absolute paths for reliability
HOOK_DIR="/home/xanacan/Dropbox/code/gemini_consensus/.claude/hooks"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] UserPromptSubmit: Running generate_verification_prompt.sh" >> $LOG_FILE

# --- READ INPUT ---
# The hook receives JSON from stdin. We need the user's raw prompt.
input_json=$(cat)
echo "Received input: $input_json" >> $LOG_FILE
user_prompt=$(echo "$input_json" | jq -r '.prompt')

# --- META-PROMPT CONSTRUCTION ---
# This is the prompt that instructs the LLM to create a plan and a verification prompt.
meta_prompt=$(cat <<EOF
You are a world-class agent orchestrator. Your job is to receive a user's request and break it down into an execution plan and a verification checklist.
You MUST respond with ONLY a valid JSON object with two keys: "plan" and "verification_prompt".
1. `plan`: A step-by-step description of how you will execute the user's request.
2. `verification_prompt`: A detailed, precise, and strict prompt for a separate QA Adjudicator AI. This prompt must contain a complete checklist of all requirements needed to verify the task is 100% complete and correct.

Here is the user's request:
"${user_prompt}"
EOF
)

# --- LLM CALL (PLACEHOLDER) ---
# In a real implementation, you would call your LLM here (e.g., via curl to Gemini/Claude API).
# This placeholder simulates that call, returning the JSON structure we need.
echo "Calling LLM with meta-prompt..." >> $LOG_FILE
llm_response_json=$(cat <<EOF
{
  "plan": [
    "1. Identify all stories within the blog page.",
    "2. For each story, append the 'before and after' section.",
    "3. Append the 'The flow to do this' section.",
    "4. Append the 'I want this savings' button.",
    "5. Provide the final, updated content."
  ],
  "verification_prompt": "You are a meticulous QA Inspector. The provided artifact must be checked against the following criteria: Verify that ALL stories have been updated. For each and every story, you must confirm the presence of three specific elements in order at the end of the story's content: 1. A section with the heading 'before and after'. 2. A section with the heading 'The flow to do this'. 3. A button element with the exact text 'I want this savings'. Your verdict must be FAIL if even one story is missing any of these elements. List all non-compliant stories in the detailed_feedback."
}
EOF
)
echo "LLM response: $llm_response_json" >> $LOG_FILE


# --- SAVE VERIFICATION PROMPT ---
# Extract the verification_prompt and save it for the PostToolUse hook.
verification_prompt=$(echo "$llm_response_json" | jq -r '.verification_prompt')

if [ -n "$verification_prompt" ]; then
  echo "$verification_prompt" > $VERIFICATION_PROMPT_FILE
  echo "Saved verification prompt to $VERIFICATION_PROMPT_FILE" >> $LOG_FILE
else
  echo "Error: Could not extract verification_prompt from LLM response." >> $LOG_FILE
  exit 1
fi

# The original user prompt is passed through to Claude untouched.
# The hook's purpose was just to generate and save the side-car verification prompt.
exit 0
