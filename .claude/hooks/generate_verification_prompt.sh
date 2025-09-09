#!/bin/bash
# .claude/hooks/generate_verification_prompt.sh
# Enhanced with completeness detection to catch partial work

set -e

# --- CONFIGURATION ---
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$HOOK_DIR/../.." && pwd)"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
LOG_FILE="$HOOK_DIR/hooks.log"
ENV_FILE="$PROJECT_DIR/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^ENABLE_VERIFICATION_LOGGING=" "$ENV_FILE" | xargs) 2>/dev/null || true
fi

ENABLE_LOGGING="${ENABLE_VERIFICATION_LOGGING:-false}"

# --- LOGGING ---
echo "---" >> $LOG_FILE
echo "[$(date)] UserPromptSubmit: Running generate_verification_prompt.sh" >> $LOG_FILE

# --- READ INPUT ---
user_prompt=$(cat)
echo "Received prompt: ${user_prompt:0:100}..." >> $LOG_FILE

# --- DETECT QUANTITIES FOR COMPLETENESS ---
detect_quantities() {
    local prompt="$1"
    local quantities=""
    
    # Detect "all" requirements
    if echo "$prompt" | grep -iE '\ball\b.*\b(blog posts?|posts?|items?|files?|pages?|components?|functions?)\b' > /dev/null; then
        quantities+="ALL items must be updated/modified\n"
        
        # Try to extract specific count
        if echo "$prompt" | grep -iE '\b([0-9]+|twenty|thirty|forty|fifty)\b.*\b(blog posts?|posts?|items?)\b' > /dev/null; then
            count=$(echo "$prompt" | grep -oE '\b[0-9]+\b.*\b(blog posts?|posts?|items?)' | grep -oE '[0-9]+' | head -1)
            if [ ! -z "$count" ]; then
                quantities+="Specifically: ALL $count items must be updated\n"
            fi
        fi
    fi
    
    # Detect "each" or "every" requirements
    if echo "$prompt" | grep -iE '\b(each|every)\b' > /dev/null; then
        quantities+="EACH/EVERY item must meet the requirements\n"
    fi
    
    echo "$quantities"
}

# --- EXTRACT VERIFICATION CRITERIA ---
echo "Parsing for verification requirements..." >> $LOG_FILE

# Keywords that indicate verification tasks
VERIFY_KEYWORDS="verify|ensure|make sure|check|validate|test|confirm|guarantee|must have|should have|need to|require"
CREATE_KEYWORDS="create|build|implement|add|write|develop|design|make|generate|produce"
UPDATE_KEYWORDS="update|modify|change|edit|fix|improve|enhance|refactor|optimize|convert"

# Check if this is a verification-worthy task
is_verification_task=false
task_type="unknown"

if echo "$user_prompt" | grep -iE "($VERIFY_KEYWORDS|$CREATE_KEYWORDS|$UPDATE_KEYWORDS)" > /dev/null; then
    is_verification_task=true
    
    # Determine task type
    if echo "$user_prompt" | grep -iE "$CREATE_KEYWORDS" > /dev/null; then
        task_type="create"
    elif echo "$user_prompt" | grep -iE "$UPDATE_KEYWORDS" > /dev/null; then
        task_type="update"
    fi
    
    echo "Detected $task_type task" >> $LOG_FILE
fi

# --- BUILD VERIFICATION CRITERIA ---
if [ "$is_verification_task" = true ]; then
    # Build comprehensive criteria
    verification_prompt="Task: $user_prompt

VERIFICATION CRITERIA:"
    
    # Add quantity requirements
    quantities=$(detect_quantities "$user_prompt")
    if [ ! -z "$quantities" ]; then
        verification_prompt+="

COMPLETENESS REQUIREMENTS:
$quantities
- Partial completion is NOT acceptable
- If 'all' items requested: Verify EVERY item is updated
- If specific count given: Verify exact count is completed"
    fi
    
    # Add task-specific rules
    case "$task_type" in
        update)
            verification_prompt+="

UPDATE VERIFICATION:
- ALL specified items must be updated (not just some)
- Changes must be applied consistently
- No items should be skipped
- Saying 'completed' without doing all work is a FAILURE"
            ;;
        create)
            verification_prompt+="

CREATION VERIFICATION:
- All specified items must be created
- Implementation must be complete
- If quantity specified, ALL items must be created"
            ;;
    esac
    
    # Add general criteria
    verification_prompt+="

GENERAL REQUIREMENTS:
- Task must be 100% complete
- All requirements must be met
- Format must be consistent across all items
- Quality standards must be maintained"
    
    # Save verification criteria
    echo "$verification_prompt" > "$VERIFICATION_PROMPT_FILE"
    echo "Saved verification criteria with completeness checks" >> $LOG_FILE
    
    # Provide feedback
    echo "🎯 Verification criteria captured! Completeness checking enabled." >&2
else
    echo "No verification keywords found - skipping" >> $LOG_FILE
fi

exit 0
