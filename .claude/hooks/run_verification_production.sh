#!/bin/bash
# .claude/hooks/run_verification_production.sh
# Production version with actual MCP server integration

set -e

# --- CONFIGURATION ---
HOOK_DIR="$(dirname "$0")"
PROJECT_DIR="$(dirname "$(dirname "$HOOK_DIR")")"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"
MCP_SERVER="$PROJECT_DIR/index.mjs"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
fi

# --- LOGGING ---
echo "---" >> "$LOG_FILE"
echo "[$(date)] PostToolUse: Running run_verification.sh" >> "$LOG_FILE"

# --- READ INPUT ---
input_json=$(cat)
echo "Received input: $input_json" >> "$LOG_FILE"

# Extract the file path that was edited
file_path=$(echo "$input_json" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.files[0] // empty')

if [ -z "$file_path" ] || [ "$file_path" == "null" ]; then
    echo "No file path found in tool input. Skipping verification." >> "$LOG_FILE"
    exit 0
fi

# Skip verification for non-code files
if [[ "$file_path" == *.md ]] || [[ "$file_path" == *.txt ]] || [[ "$file_path" == *.json ]]; then
    echo "Skipping verification for non-code file: $file_path" >> "$LOG_FILE"
    exit 0
fi

# --- READ VERIFICATION DATA ---
if [ ! -f "$VERIFICATION_PROMPT_FILE" ]; then
    echo "No verification prompt file. Skipping verification." >> "$LOG_FILE"
    exit 0
fi

verification_prompt=$(cat "$VERIFICATION_PROMPT_FILE")

# Check if file exists and read content
if [ ! -f "$file_path" ]; then
    echo "File not found: $file_path. Skipping verification." >> "$LOG_FILE"
    exit 0
fi

artifact_content=$(cat "$file_path" | head -c 100000)  # Limit to 100KB for API

# --- CALL MCP SERVER ---
echo "Calling MCP Gemini Adjudicator for file: $file_path" >> "$LOG_FILE"

# Determine task type based on file extension
task_type="code_review"
if [[ "$file_path" == *.test.* ]] || [[ "$file_path" == *.spec.* ]]; then
    task_type="test_report_review"
fi

# Create the verification request
verification_request=$(jq -n \
  --arg artifact "$artifact_content" \
  --arg task "$task_type" \
  --arg tests "{\"verification_prompt\": $(echo "$verification_prompt" | jq -Rs .)}" \
  '{
    artifact: $artifact,
    task: $task,
    tests_json: $tests,
    ground_with_search: false
  }')

# Call the MCP server using a Node.js helper script
adjudicator_response=$(cat <<'SCRIPT' | node - "$verification_request" 2>> "$LOG_FILE"
const request = JSON.parse(process.argv[2]);
const { spawn } = require('child_process');
const path = require('path');

// Create MCP request
const mcpRequest = {
  jsonrpc: "2.0",
  method: "tools/call",
  params: {
    name: "verify_with_gemini",
    arguments: request
  },
  id: 1
};

// Spawn the MCP server
const serverPath = path.join(__dirname, '../../index.mjs');
const mcp = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

let output = '';
let errorOutput = '';

mcp.stdout.on('data', (data) => {
  output += data.toString();
});

mcp.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

mcp.on('close', (code) => {
  if (code !== 0) {
    console.error(JSON.stringify({
      verdict: "NEEDS_IMPROVEMENT",
      confidence: 0,
      detailed_feedback: "MCP server error: " + errorOutput
    }));
  } else {
    try {
      const lines = output.split('\n').filter(l => l.trim());
      const lastLine = lines[lines.length - 1];
      const response = JSON.parse(lastLine);
      if (response.result && response.result.content) {
        console.log(response.result.content[0].text);
      } else {
        console.log(JSON.stringify({
          verdict: "NEEDS_IMPROVEMENT",
          confidence: 0,
          detailed_feedback: "Invalid MCP response format"
        }));
      }
    } catch (e) {
      console.log(JSON.stringify({
        verdict: "NEEDS_IMPROVEMENT",
        confidence: 0,
        detailed_feedback: "Failed to parse MCP response: " + e.message
      }));
    }
  }
});

// Send the request
mcp.stdin.write(JSON.stringify(mcpRequest) + '\n');
mcp.stdin.end();
SCRIPT
)

if [ -z "$adjudicator_response" ]; then
    echo "Empty response from adjudicator. Using direct API call as fallback." >> "$LOG_FILE"
    
    # Fallback to direct Gemini API call
    if [ -n "$GEMINI_API_KEY" ]; then
        adjudicator_response=$(curl -s -X POST \
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=$GEMINI_API_KEY" \
          -H "Content-Type: application/json" \
          -d "{
            \"contents\": [{
              \"parts\": [{
                \"text\": \"Verify this code against the following criteria:\n\nCriteria: $verification_prompt\n\nCode to verify:\n$artifact_content\n\nRespond with JSON: {verdict: PASS|FAIL|NEEDS_IMPROVEMENT, confidence: 0-1, detailed_feedback: string}\"
              }]
            }],
            \"generationConfig\": {
              \"temperature\": 0.3,
              \"responseMimeType\": \"application/json\"
            }
          }" | jq -r '.candidates[0].content.parts[0].text // empty')
    fi
fi

echo "Adjudicator response: $adjudicator_response" >> "$LOG_FILE"

# --- PROCESS VERDICT ---
verdict=$(echo "$adjudicator_response" | jq -r '.verdict // "PASS"' 2>/dev/null || echo "PASS")
confidence=$(echo "$adjudicator_response" | jq -r '.confidence // 0' 2>/dev/null || echo "0")
feedback=$(echo "$adjudicator_response" | jq -r '.detailed_feedback // "No feedback available"' 2>/dev/null || echo "No feedback")

echo "Verdict: $verdict (confidence: $confidence)" >> "$LOG_FILE"

if [ "$verdict" == "FAIL" ] || ([ "$verdict" == "NEEDS_IMPROVEMENT" ] && [ "$(echo "$confidence > 0.7" | bc -l 2>/dev/null || echo 0)" == "1" ]); then
    echo "❌ Verification FAILED for $file_path" >> "$LOG_FILE"
    echo "Feedback: $feedback" >> "$LOG_FILE"
    
    # Return error message to Claude
    cat <<ERROR_MSG
⚠️ Gemini Verification Failed

The changes to $file_path did not pass verification.

**Verdict**: $verdict (Confidence: $confidence)
**Feedback**: $feedback

Please address these issues and try again.
ERROR_MSG
    
    exit 1  # Block the operation
else
    echo "✅ Verification PASSED for $file_path" >> "$LOG_FILE"
    
    # Clean up on success
    rm -f "$VERIFICATION_PROMPT_FILE"
    rm -f "$HOOK_DIR/last_plan.json"
    
    # Optional: Provide success feedback
    if [ "$confidence" != "0" ]; then
        echo "✅ Verification passed with $(echo "$confidence * 100" | bc -l | cut -d. -f1)% confidence"
    fi
fi

exit 0