#!/bin/bash
# Enhanced verification prompt generator that detects scope and quantities
# Catches "shenanigans" like updating only 3 posts when asked for all 20

set -e

# --- CONFIGURATION ---
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$HOOK_DIR/../.." && pwd)"
VERIFICATION_PROMPT_FILE="$HOOK_DIR/last_verification_prompt.txt"
PROMPT_HISTORY_FILE="$HOOK_DIR/prompt_history.json"
PARSING_LOG_FILE="$HOOK_DIR/parsing_log.json"
LOG_FILE="$HOOK_DIR/hooks.log"
ENV_FILE="$PROJECT_DIR/.env"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^ENABLE_VERIFICATION_LOGGING=" "$ENV_FILE" | xargs) 2>/dev/null || true
fi

ENABLE_LOGGING="${ENABLE_VERIFICATION_LOGGING:-false}"

# --- LOGGING FUNCTION ---
log_json() {
    if [ "$ENABLE_LOGGING" != "true" ]; then
        return
    fi
    
    local file=$1
    local entry=$2
    
    if [ -f "$file" ] && [ -s "$file" ]; then
        existing=$(cat "$file")
    else
        existing="[]"
    fi
    
    updated=$(echo "$existing" | jq --argjson new "$entry" '. += [$new] | .[-20:]')
    echo "$updated" > "$file"
}

# --- LOG TO STANDARD LOG ---
echo "---" >> $LOG_FILE
echo "[$(date)] UserPromptSubmit Hook triggered (Enhanced)" >> $LOG_FILE

# --- READ USER PROMPT ---
user_prompt=$(cat)
timestamp=$(date -Iseconds)

echo "Received prompt: ${user_prompt:0:100}..." >> $LOG_FILE

# --- DETECT QUANTITATIVE REQUIREMENTS ---
detect_quantities() {
    local prompt="$1"
    local quantities=""
    
    # Detect "all" requirements
    if echo "$prompt" | grep -iE '\ball\b.*\b(blog posts?|posts?|items?|files?|pages?|components?|functions?)\b' > /dev/null; then
        quantities+="ALL items must be updated/modified\n"
        
        # Try to extract the specific count if mentioned
        if echo "$prompt" | grep -iE '\b(20|twenty)\b.*\b(blog posts?|posts?)\b' > /dev/null; then
            quantities+="Specifically: ALL 20 blog posts must be updated\n"
        elif echo "$prompt" | grep -iE '\b([0-9]+)\b.*\b(blog posts?|posts?|items?|files?)\b' > /dev/null; then
            count=$(echo "$prompt" | grep -oE '\b[0-9]+\b.*\b(blog posts?|posts?|items?|files?)' | grep -oE '[0-9]+' | head -1)
            quantities+="Specifically: ALL $count items must be updated\n"
        fi
    fi
    
    # Detect numeric requirements
    if echo "$prompt" | grep -iE '\b[0-9]+\b.*\b(blog posts?|posts?|items?|files?|pages?|components?)\b' > /dev/null; then
        numbers=$(echo "$prompt" | grep -oE '\b[0-9]+\b.*\b(blog posts?|posts?|items?|files?|pages?|components?)' | head -5)
        if [ ! -z "$numbers" ]; then
            quantities+="Numeric requirements found:\n$numbers\n"
        fi
    fi
    
    # Detect "each" or "every" requirements
    if echo "$prompt" | grep -iE '\b(each|every)\b.*\b(blog posts?|posts?|items?|must|should|needs?)\b' > /dev/null; then
        quantities+="EACH/EVERY item must meet the requirements\n"
    fi
    
    # Detect "remaining" requirements
    if echo "$prompt" | grep -iE '\b(remaining|rest of|other)\b.*\b(blog posts?|posts?|items?)\b' > /dev/null; then
        quantities+="REMAINING items must also be updated\n"
    fi
    
    echo "$quantities"
}

# --- DETECT FORMAT REQUIREMENTS ---
detect_format_requirements() {
    local prompt="$1"
    local format_reqs=""
    
    # Detect specific format mentions
    if echo "$prompt" | grep -iE '\b(format|structure|template|pattern|style)\b' > /dev/null; then
        format_reqs+="Specific format/structure must be followed\n"
        
        # Look for format specifications
        if echo "$prompt" | grep -iE '\b(H1|H2|H3|heading|title)\b' > /dev/null; then
            format_reqs+="- Heading requirements (H1/H2/H3) specified\n"
        fi
        
        if echo "$prompt" | grep -iE '\b([0-9]+\+?\s*words?|word count)\b' > /dev/null; then
            word_count=$(echo "$prompt" | grep -oE '[0-9]+\+?\s*words?' | head -1)
            format_reqs+="- Word count requirement: $word_count\n"
        fi
        
        if echo "$prompt" | grep -iE '\b(bullet|list|numbered|steps?)\b' > /dev/null; then
            format_reqs+="- List/bullet point formatting required\n"
        fi
        
        if echo "$prompt" | grep -iE '\b(button|CTA|call.to.action)\b' > /dev/null; then
            format_reqs+="- CTA/Button elements required\n"
        fi
    fi
    
    # Detect consistency requirements
    if echo "$prompt" | grep -iE '\b(same|consistent|match|like|similar)\b' > /dev/null; then
        format_reqs+="All items must have CONSISTENT formatting\n"
    fi
    
    echo "$format_reqs"
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
    
    # Build comprehensive criteria
    extracted_criteria="Task: $user_prompt

VERIFICATION CRITERIA:
"
    
    # Add quantity requirements
    quantities=$(detect_quantities "$user_prompt")
    if [ ! -z "$quantities" ]; then
        extracted_criteria+="
QUANTITY REQUIREMENTS:
$quantities"
    fi
    
    # Add format requirements
    formats=$(detect_format_requirements "$user_prompt")
    if [ ! -z "$formats" ]; then
        extracted_criteria+="
FORMAT REQUIREMENTS:
$formats"
    fi
    
    # Extract bullet points or numbered items from prompt
    if echo "$user_prompt" | grep -E "[-•*]|[0-9]+\." > /dev/null; then
        bullets=$(echo "$user_prompt" | grep -E "[-•*]|[0-9]+\." | sed 's/^[[:space:]]*//')
        extracted_criteria+="
SPECIFIC REQUIREMENTS FROM PROMPT:
$bullets"
    fi
    
    # Extract quoted requirements
    if echo "$user_prompt" | grep -E '"[^"]+"' > /dev/null; then
        quotes=$(echo "$user_prompt" | grep -oE '"[^"]+"')
        extracted_criteria+="
QUOTED REQUIREMENTS:
$quotes"
    fi
    
    # Add task-specific verification rules
    case "$task_type" in
        create)
            extracted_criteria+="
CREATION VERIFICATION:
- All specified files/components must be created
- Implementation must be complete (not partial)
- All requirements must be met, not just some
- If quantity specified, ALL items must be created"
            ;;
        update)
            extracted_criteria+="
UPDATE VERIFICATION:
- ALL specified items must be updated (not just some)
- Changes must be applied consistently across all items
- Format requirements must be met for EVERY item
- No items should be skipped or forgotten
- If 'all' or a specific count is mentioned, verify EACH one"
            ;;
        verify)
            extracted_criteria+="
VERIFICATION CHECKS:
- All specified checks must pass
- Comprehensive coverage (not selective)
- Each item must be individually verified
- Consistent standards across all items"
            ;;
    esac
    
    # Add completeness check
    extracted_criteria+="

COMPLETENESS CHECK:
- If 'all' items requested: Verify EVERY item is updated
- If specific count given: Verify exact count is completed
- If pattern/format specified: Verify ALL items follow it
- Partial completion is NOT acceptable
- Saying 'completed' without doing all work is a FAILURE"
    
    # Save verification criteria
    echo "$extracted_criteria" > "$VERIFICATION_PROMPT_FILE"
    echo "Saved enhanced verification criteria to file" >> $LOG_FILE
    
    # Save backup if logging enabled
    if [ "$ENABLE_LOGGING" = "true" ]; then
        backup_file="$HOOK_DIR/logs/criteria_$(date +%Y%m%d_%H%M%S).txt"
        mkdir -p "$HOOK_DIR/logs"
        echo "$extracted_criteria" > "$backup_file"
    fi
    
else
    echo "No verification keywords found - skipping" >> $LOG_FILE
    extracted_criteria="No verification criteria detected"
fi

# --- LOG PARSING DETAILS ---
if [ "$ENABLE_LOGGING" = "true" ]; then
    parsing_entry=$(jq -n \
        --arg prompt "$user_prompt" \
        --arg time "$timestamp" \
        --arg type "$task_type" \
        --argjson is_verify "$is_verification_task" \
        --arg criteria "$extracted_criteria" \
        --arg quantities "$quantities" \
        --arg formats "$formats" \
        '{
            timestamp: $time,
            prompt_snippet: ($prompt | .[0:200]),
            task_type: $type,
            is_verification_task: $is_verify,
            quantities_detected: $quantities,
            formats_detected: $formats,
            criteria_extracted: $criteria,
            criteria_saved: $is_verify
        }')
    
    log_json "$PARSING_LOG_FILE" "$parsing_entry"
    
    # Log prompt to history
    prompt_entry=$(jq -n \
        --arg prompt "$user_prompt" \
        --arg time "$timestamp" \
        '{
            timestamp: $time,
            prompt: $prompt,
            length: ($prompt | length)
        }')
    
    log_json "$PROMPT_HISTORY_FILE" "$prompt_entry"
fi

# --- PROVIDE FEEDBACK ---
if [ "$is_verification_task" = true ]; then
    echo "✅ Enhanced verification criteria extracted!" >> $LOG_FILE
    echo "📝 Task type: $task_type" >> $LOG_FILE
    
    if [ ! -z "$quantities" ]; then
        echo "🔢 Quantity requirements detected" >> $LOG_FILE
    fi
    
    if [ ! -z "$formats" ]; then
        echo "📐 Format requirements detected" >> $LOG_FILE
    fi
    
    echo "🎯 Criteria saved for automatic verification" >> $LOG_FILE
    
    # Send feedback to Claude
    echo "🎯 Enhanced verification active! Will check for:" >&2
    
    if [ ! -z "$quantities" ]; then
        echo "  • Quantity compliance (ALL items must be updated)" >&2
    fi
    
    if [ ! -z "$formats" ]; then
        echo "  • Format consistency across all items" >&2
    fi
    
    echo "  • Complete task execution (no partial work)" >&2
    echo "  • All requirements met, not just some" >&2
else
    echo "ℹ️ No verification criteria detected in prompt" >> $LOG_FILE
fi

echo "UserPromptSubmit hook (enhanced) completed successfully" >> $LOG_FILE

exit 0