#!/bin/bash
# .claude/hooks/generate_verification_prompt_production.sh
# Production version with actual Gemini API integration

set -e

# --- CONFIGURATION ---
HOOK_DIR="$(dirname "$0")"
PROJECT_DIR="$(dirname "$(dirname "$HOOK_DIR")")"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
fi

# --- LOGGING ---
echo "---" >> "$LOG_FILE"
echo "[$(date)] UserPromptSubmit: Running generate_verification_prompt.sh" >> "$LOG_FILE"

# --- READ INPUT ---
input_json=$(cat)
echo "Received input: $input_json" >> "$LOG_FILE"
user_prompt=$(echo "$input_json" | jq -r '.prompt // empty')

if [ -z "$user_prompt" ]; then
    echo "No prompt found in input. Exiting." >> "$LOG_FILE"
    exit 0
fi

# --- META-PROMPT CONSTRUCTION ---
meta_prompt=$(cat <<EOF
You are an expert task planner and verification specialist. Analyze the following user request and create a verification strategy.

Respond with ONLY valid JSON containing:
{
  "plan": ["step 1", "step 2", ...],
  "verification_prompt": "Detailed checklist for verifying task completion",
  "success_criteria": ["criterion 1", "criterion 2", ...],
  "risk_areas": ["potential issue 1", "potential issue 2", ...]
}

The verification_prompt must be extremely specific and measurable. Include:
- Exact requirements that must be met
- Specific elements to check for
- Quantifiable success metrics
- Edge cases to verify

User request: "${user_prompt}"
EOF
)

# --- CALL GEMINI API ---
if [ -z "$GEMINI_API_KEY" ]; then
    echo "Warning: GEMINI_API_KEY not set. Using fallback verification." >> "$LOG_FILE"
    # Fallback verification prompt
    echo "Verify that the task '$user_prompt' has been completed successfully." > "$VERIFICATION_PROMPT_FILE"
    exit 0
fi

echo "Calling Gemini API..." >> "$LOG_FILE"

# Make the API call
api_response=$(curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [{\"text\": \"$meta_prompt\"}]
    }],
    \"generationConfig\": {
      \"temperature\": 0.3,
      \"topK\": 20,
      \"topP\": 0.95,
      \"maxOutputTokens\": 2048,
      \"responseMimeType\": \"application/json\"
    }
  }" 2>> "$LOG_FILE")

# Extract the response text
response_text=$(echo "$api_response" | jq -r '.candidates[0].content.parts[0].text // empty' 2>> "$LOG_FILE")

if [ -z "$response_text" ]; then
    echo "Error: Empty response from Gemini API" >> "$LOG_FILE"
    echo "API Response: $api_response" >> "$LOG_FILE"
    # Use a generic verification prompt as fallback
    echo "Verify that all requested changes have been made correctly and completely." > "$VERIFICATION_PROMPT_FILE"
    exit 0
fi

# Extract verification prompt from JSON response
verification_prompt=$(echo "$response_text" | jq -r '.verification_prompt // empty' 2>> "$LOG_FILE")

if [ -z "$verification_prompt" ]; then
    echo "Warning: Could not extract verification_prompt. Using full response." >> "$LOG_FILE"
    verification_prompt="$response_text"
fi

# Save the verification prompt
echo "$verification_prompt" > "$VERIFICATION_PROMPT_FILE"
echo "Saved verification prompt to $VERIFICATION_PROMPT_FILE" >> "$LOG_FILE"

# Also save the full plan for reference
if echo "$response_text" | jq -e '.plan' > /dev/null 2>&1; then
    echo "$response_text" > "$HOOK_DIR/last_plan.json"
    echo "Saved full plan to last_plan.json" >> "$LOG_FILE"
fi

exit 0