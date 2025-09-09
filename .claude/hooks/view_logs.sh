#!/bin/bash
# View verification logs in a user-friendly format

set -e

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_HISTORY_FILE="$HOOK_DIR/prompt_history.json"
PARSING_LOG_FILE="$HOOK_DIR/parsing_log.json"
GEMINI_LOG_FILE="$HOOK_DIR/gemini_log.json"
LOG_DIR="$HOOK_DIR/logs"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== MCP Gemini Verification Logs ===${NC}"
echo ""

# Function to display a section
show_section() {
    local title=$1
    local file=$2
    local count=${3:-5}
    
    echo -e "${GREEN}$title${NC}"
    echo "----------------------------------------"
    
    if [ -f "$file" ] && [ -s "$file" ]; then
        # Get last N entries
        entries=$(cat "$file" | jq -r ".[-$count:] | reverse | .[]" 2>/dev/null)
        
        if [ ! -z "$entries" ]; then
            echo "$entries" | jq -r '
                "\(.timestamp) - " +
                if .event then
                    "Event: \(.event)\n" +
                    if .file_path then "  File: \(.file_path)\n" else "" end +
                    if .verdict then "  Verdict: \(.verdict) (confidence: \(.confidence))\n" else "" end +
                    if .feedback then "  Feedback: \(.feedback | .[0:100])...\n" else "" end +
                    if .error then "  Error: \(.error)\n" else "" end
                elif .prompt then
                    "Prompt: \(.prompt | .[0:100])...\n" +
                    "  Length: \(.length) chars\n"
                elif .task_type then
                    "Task Type: \(.task_type)\n" +
                    "  Verification: \(if .is_verification_task then "Yes" else "No" end)\n" +
                    if .criteria_extracted then "  Criteria: \(.criteria_extracted | .[0:100])...\n" else "" end
                else
                    tostring
                end
            ' 2>/dev/null || echo "  Error parsing entries"
        else
            echo "  No entries found"
        fi
    else
        echo "  No log file found or file is empty"
    fi
    echo ""
}

# Parse command line arguments
SHOW_COUNT=5
SHOW_TYPE="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--count)
            SHOW_COUNT="$2"
            shift 2
            ;;
        -t|--type)
            SHOW_TYPE="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -n, --count N    Show last N entries (default: 5)"
            echo "  -t, --type TYPE  Show specific log type:"
            echo "                   prompts - User prompts"
            echo "                   parsing - Parsing results"
            echo "                   gemini  - Gemini API calls"
            echo "                   files   - Saved request/response files"
            echo "                   all     - All logs (default)"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Show logs based on type
case "$SHOW_TYPE" in
    prompts)
        show_section "📝 Recent User Prompts" "$PROMPT_HISTORY_FILE" "$SHOW_COUNT"
        ;;
    parsing)
        show_section "🔍 Parsing Results" "$PARSING_LOG_FILE" "$SHOW_COUNT"
        ;;
    gemini)
        show_section "🤖 Gemini API Calls" "$GEMINI_LOG_FILE" "$SHOW_COUNT"
        ;;
    files)
        echo -e "${GREEN}📁 Saved Request/Response Files${NC}"
        echo "----------------------------------------"
        if [ -d "$LOG_DIR" ]; then
            echo "Recent request files:"
            ls -lt "$LOG_DIR"/last_gemini_request_*.txt 2>/dev/null | head -5 | awk '{print "  " $9}'
            echo ""
            echo "Recent response files:"
            ls -lt "$LOG_DIR"/last_gemini_response_*.json 2>/dev/null | head -5 | awk '{print "  " $9}'
            echo ""
            echo "Recent criteria files:"
            ls -lt "$LOG_DIR"/criteria_*.txt 2>/dev/null | head -5 | awk '{print "  " $9}'
        else
            echo "  No log directory found"
        fi
        echo ""
        ;;
    all)
        show_section "📝 Recent User Prompts" "$PROMPT_HISTORY_FILE" "$SHOW_COUNT"
        show_section "🔍 Parsing Results" "$PARSING_LOG_FILE" "$SHOW_COUNT"
        show_section "🤖 Gemini API Calls" "$GEMINI_LOG_FILE" "$SHOW_COUNT"
        
        echo -e "${GREEN}📁 Recent Files in logs/${NC}"
        echo "----------------------------------------"
        if [ -d "$LOG_DIR" ]; then
            ls -lt "$LOG_DIR" 2>/dev/null | head -6 | tail -5 | awk '{print "  " $9 " (" $6 " " $7 " " $8 ")"}'
        else
            echo "  No log directory found"
        fi
        echo ""
        ;;
    *)
        echo "Unknown log type: $SHOW_TYPE"
        exit 1
        ;;
esac

# Show summary
echo -e "${YELLOW}=== Summary ===${NC}"
if [ -f "$PROMPT_HISTORY_FILE" ]; then
    prompt_count=$(cat "$PROMPT_HISTORY_FILE" | jq 'length' 2>/dev/null || echo 0)
    echo "Total prompts logged: $prompt_count"
fi

if [ -f "$GEMINI_LOG_FILE" ]; then
    gemini_count=$(cat "$GEMINI_LOG_FILE" | jq 'length' 2>/dev/null || echo 0)
    echo "Total Gemini API calls: $gemini_count"
    
    # Count pass/fail
    pass_count=$(cat "$GEMINI_LOG_FILE" | jq '[.[] | select(.verdict == "PASS")] | length' 2>/dev/null || echo 0)
    fail_count=$(cat "$GEMINI_LOG_FILE" | jq '[.[] | select(.verdict == "FAIL")] | length' 2>/dev/null || echo 0)
    echo "  Passed: $pass_count"
    echo "  Failed: $fail_count"
fi

echo ""
echo -e "${BLUE}Tip: Use -n 10 to see more entries, or -t gemini to see only Gemini logs${NC}"