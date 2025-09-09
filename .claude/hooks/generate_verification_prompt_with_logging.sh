#!/bin/bash
# Enhanced verification prompt generator with comprehensive logging
# Tracks last 20 prompts and logs all parsing details

set -e

# --- CONFIGURATION ---
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$HOOK_DIR/../.." && pwd)"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
PROMPT_HISTORY_FILE="$HOOK_DIR/prompt_history.json"
PARSING_LOG_FILE="$HOOK_DIR/parsing_log.json"
LOG_FILE="$HOOK_DIR/hooks.log"
ENV_FILE="$PROJECT_DIR/.env"
MAX_HISTORY=20

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^ENABLE_VERIFICATION_LOGGING=" "$ENV_FILE" | xargs) 2>/dev/null || true
fi

# Check if logging is enabled (default: off)
ENABLE_LOGGING="${ENABLE_VERIFICATION_LOGGING:-false}"

# --- INITIALIZE LOGS ---
mkdir -p "$HOOK_DIR/logs"
touch "$PROMPT_HISTORY_FILE"
touch "$PARSING_LOG_FILE"

# --- LOGGING FUNCTION ---
log_json() {
    # Only log if logging is enabled
    if [ "$ENABLE_LOGGING" != "true" ]; then
        return
    fi
    
    local file=$1
    local entry=$2
    
    # Read existing JSON array or create new one
    if [ -f "$file" ] && [ -s "$file" ]; then
        existing=$(cat "$file")
    else
        existing="[]"
    fi
    
    # Add new entry and limit to MAX_HISTORY
    updated=$(echo "$existing" | jq --argjson new "$entry" '. += [$new] | .[-20:]')
    echo "$updated" > "$file"
}

# --- LOG TO STANDARD LOG ---
echo "---" >> $LOG_FILE
echo "[$(date)] UserPromptSubmit Hook triggered" >> $LOG_FILE

# --- READ USER PROMPT ---
user_prompt=$(cat)
timestamp=$(date -Iseconds)

echo "Received prompt: ${user_prompt:0:100}..." >> $LOG_FILE

# --- LOG PROMPT TO HISTORY ---
prompt_entry=$(jq -n \
    --arg prompt "$user_prompt" \
    --arg time "$timestamp" \
    '{
        timestamp: $time,
        prompt: $prompt,
        length: ($prompt | length)
    }')

log_json "$PROMPT_HISTORY_FILE" "$prompt_entry"

# --- EXTRACT VERIFICATION CRITERIA ---
echo "Parsing for verification keywords..." >> $LOG_FILE

# Keywords that indicate verification tasks
VERIFY_KEYWORDS="verify|ensure|make sure|check|validate|test|confirm|guarantee|must have|should have|need to|require"
CREATE_KEYWORDS="create|build|implement|add|write|develop|design|make|generate|produce"
UPDATE_KEYWORDS="update|modify|change|edit|fix|improve|enhance|refactor|optimize"

# Check if this is a verification-worthy task
is_verification_task=false
task_type="unknown"
extracted_criteria=""

if echo "$user_prompt" | grep -iE "($VERIFY_KEYWORDS|$CREATE_KEYWORDS|$UPDATE_KEYWORDS)" > /dev/null; then
    is_verification_task=true
    
    # Determine task type
    if echo "$user_prompt" | grep -iE "$CREATE_KEYWORDS" > /dev/null; then
        task_type="create"
    elif echo "$user_prompt" | grep -iE "$UPDATE_KEYWORDS" > /dev/null; then
        task_type="update"
    elif echo "$user_prompt" | grep -iE "$VERIFY_KEYWORDS" > /dev/null; then
        task_type="verify"
    fi
    
    echo "Detected $task_type task" >> $LOG_FILE
    
    # Extract specific requirements
    extracted_criteria="Task: $user_prompt

Verification Criteria:
"
    
    # Extract bullet points or numbered items
    if echo "$user_prompt" | grep -E "[-•*]|[0-9]+\." > /dev/null; then
        bullets=$(echo "$user_prompt" | grep -E "[-•*]|[0-9]+\." | sed 's/^[[:space:]]*//')
        extracted_criteria+="
Specific requirements found:
$bullets"
    fi
    
    # Extract quoted requirements
    if echo "$user_prompt" | grep -E '"[^"]+"' > /dev/null; then
        quotes=$(echo "$user_prompt" | grep -oE '"[^"]+"')
        extracted_criteria+="
Quoted requirements:
$quotes"
    fi
    
    # Add general criteria based on task type
    case "$task_type" in
        create)
            extracted_criteria+="
- File/component must be created
- Implementation must be complete and functional
- Code must follow best practices
- Error handling must be included where appropriate"
            ;;
        update)
            extracted_criteria+="
- Requested changes must be implemented
- Existing functionality must not be broken
- Changes must be tested/validated
- Code quality must be maintained or improved"
            ;;
        verify)
            extracted_criteria+="
- All specified checks must pass
- No errors or warnings in implementation
- Requirements must be fully met
- Edge cases must be handled"
            ;;
    esac
    
    # Save verification criteria
    echo "$extracted_criteria" > "$VERIFICATION_PROMPT_FILE"
    echo "Saved verification criteria to file" >> $LOG_FILE
    
    # Also save a backup with timestamp (only if logging enabled)
    if [ "$ENABLE_LOGGING" = "true" ]; then
        backup_file="$HOOK_DIR/logs/criteria_$(date +%Y%m%d_%H%M%S).txt"
        echo "$extracted_criteria" > "$backup_file"
    fi
    
else
    echo "No verification keywords found - skipping" >> $LOG_FILE
    extracted_criteria="No verification criteria detected"
fi

# --- LOG PARSING DETAILS ---
parsing_entry=$(jq -n \
    --arg prompt "$user_prompt" \
    --arg time "$timestamp" \
    --arg type "$task_type" \
    --argjson is_verify "$is_verification_task" \
    --arg criteria "$extracted_criteria" \
    '{
        timestamp: $time,
        prompt_snippet: ($prompt | .[0:200]),
        task_type: $type,
        is_verification_task: $is_verify,
        criteria_extracted: $criteria,
        criteria_saved: $is_verify
    }')

log_json "$PARSING_LOG_FILE" "$parsing_entry"

# --- PROVIDE FEEDBACK ---
if [ "$is_verification_task" = true ]; then
    echo "✅ Verification criteria extracted from your prompt" >> $LOG_FILE
    echo "📝 Task type: $task_type" >> $LOG_FILE
    echo "🎯 Criteria saved for automatic verification" >> $LOG_FILE
    
    # Send feedback to Claude
    echo "🎯 Verification criteria captured! All file changes will be automatically verified against your requirements." >&2
else
    echo "ℹ️ No verification criteria detected in prompt" >> $LOG_FILE
fi

# Log summary
echo "UserPromptSubmit hook completed successfully" >> $LOG_FILE

exit 0