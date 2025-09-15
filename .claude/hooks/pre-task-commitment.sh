#!/bin/bash

# Pre-task hook: Extract and store commitments per PRD v2
# Creates structured commitment JSON from user prompts

set -e

LOG_FILE=".claude/hooks/verification.log"
COMMITMENT_FILE=".claude/verification/commitment.json"
PROFILE_FILE="verification.profiles.json"

# Get user prompt from stdin
USER_PROMPT=$(cat)

echo "[$(date)] Pre-task commitment extraction" >> "$LOG_FILE"

# Generate task ID
TASK_ID="task-$(date +%s)-$$"

# Extract quantities and requirements
EXPECTED_TOTAL=0
WORD_MIN=0
TASK_TYPE="unknown"
PROFILE="content_default"

# Extract numbers from prompt
if echo "$USER_PROMPT" | grep -qE '\b[0-9]+\b'; then
    EXPECTED_TOTAL=$(echo "$USER_PROMPT" | grep -oE '\b[0-9]+\b' | head -1)
fi

# Extract word count requirements
if echo "$USER_PROMPT" | grep -qiE '[0-9]+ words?'; then
    WORD_MIN=$(echo "$USER_PROMPT" | grep -oE '[0-9]+ words?' | grep -oE '[0-9]+' | head -1)
fi

# Determine task type and profile
if echo "$USER_PROMPT" | grep -qiE "create|write|generate.*blog|post|article|content"; then
    TASK_TYPE="content"
    PROFILE="content_default"
elif echo "$USER_PROMPT" | grep -qiE "update|modify|add.*code|function|endpoint"; then
    TASK_TYPE="code"
    PROFILE="code_update"
elif echo "$USER_PROMPT" | grep -qiE "check.*link|url|website"; then
    TASK_TYPE="link_check"
    PROFILE="link_check"
else
    TASK_TYPE="content"
    PROFILE="content_default"
fi

# Extract scope information
SCOPE_FILES=""
TARGET_DIR="testblog"

if echo "$USER_PROMPT" | grep -qiE "docs folder|docs/"; then
    TARGET_DIR="docs"
elif echo "$USER_PROMPT" | grep -qiE "src folder|src/"; then
    TARGET_DIR="src"
fi

# Create commitment JSON per PRD schema
mkdir -p .claude/verification

cat > "$COMMITMENT_FILE" << EOF
{
  "task_id": "$TASK_ID",
  "type": "$TASK_TYPE",
  "profile": "$PROFILE",
  "user_instruction": $(echo "$USER_PROMPT" | jq -Rs .),
  "commitments": {
    "expected_total": $EXPECTED_TOTAL,
    "quality": {
      "word_min": $WORD_MIN,
      "coverage": 1.0
    },
    "scope": {
      "target_directory": "$TARGET_DIR",
      "files": [],
      "functions": [],
      "endpoints": []
    }
  },
  "timestamp": "$(date -Iseconds)"
}
EOF

echo "Stored commitment for task $TASK_ID: $EXPECTED_TOTAL units, type=$TASK_TYPE" >> "$LOG_FILE"

# Pass through the original prompt
echo "$USER_PROMPT"