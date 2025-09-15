#!/bin/bash

# Storage interface for verification hooks
# Provides simple file-based storage for pre/post hook communication

STORAGE_DIR="${STORAGE_DIR:-$HOME/.claude/verification}"
SESSION_FILE="$STORAGE_DIR/current_session.json"
METRICS_FILE="$STORAGE_DIR/metrics.json"
HISTORY_DIR="$STORAGE_DIR/history"

# Initialize storage
init_storage() {
    mkdir -p "$STORAGE_DIR"
    mkdir -p "$HISTORY_DIR"

    # Initialize metrics if not exists
    if [ ! -f "$METRICS_FILE" ]; then
        echo '{
            "total_verifications": 0,
            "passed": 0,
            "failed": 0,
            "incomplete_tasks": []
        }' > "$METRICS_FILE"
    fi
}

# Store requirements from pre-hook
store_requirements() {
    local task_id="$1"
    local prompt="$2"
    local expected_count="$3"
    local scope="$4"
    local action="$5"
    local discovered_items="$6"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "$SESSION_FILE" << EOF
{
    "task_id": "$task_id",
    "timestamp": "$timestamp",
    "status": "pending",
    "requirements": {
        "original_prompt": "$prompt",
        "expected_count": "$expected_count",
        "scope": "$scope",
        "action": "$action",
        "discovered_items": $discovered_items,
        "verification_criteria": []
    },
    "actual": {
        "count": 0,
        "items": [],
        "completed_at": null
    }
}
EOF

    echo "Stored requirements for task $task_id: $expected_count expected"
}

# Update with actual results from post-hook
update_actuals() {
    local task_id="$1"
    local actual_count="$2"
    local actual_items="$3"

    if [ ! -f "$SESSION_FILE" ]; then
        echo "ERROR: No session file found"
        return 1
    fi

    # Load current session
    local session=$(cat "$SESSION_FILE")
    local stored_task_id=$(echo "$session" | jq -r '.task_id')

    if [ "$stored_task_id" != "$task_id" ]; then
        echo "ERROR: Task ID mismatch. Expected $stored_task_id, got $task_id"
        return 1
    fi

    # Update actual values
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local updated=$(echo "$session" | jq \
        --arg count "$actual_count" \
        --argjson items "$actual_items" \
        --arg timestamp "$timestamp" \
        '.actual.count = ($count | tonumber) |
         .actual.items = $items |
         .actual.completed_at = $timestamp |
         .status = "completed"')

    echo "$updated" > "$SESSION_FILE"

    # Archive to history
    archive_session "$task_id"

    echo "Updated actuals for task $task_id: $actual_count completed"
}

# Calculate verification verdict
calculate_verdict() {
    if [ ! -f "$SESSION_FILE" ]; then
        echo '{"verdict": "ERROR", "reason": "No session found"}'
        return 1
    fi

    local session=$(cat "$SESSION_FILE")
    local expected=$(echo "$session" | jq -r '.requirements.expected_count')
    local actual=$(echo "$session" | jq -r '.actual.count')

    # Handle "ALL" case
    if [ "$expected" = "ALL" ]; then
        local discovered=$(echo "$session" | jq '.requirements.discovered_items | length')
        expected=$discovered
    fi

    if [ "$actual" -lt "$expected" ]; then
        local missing=$((expected - actual))
        echo "{
            \"verdict\": \"FAIL\",
            \"reason\": \"Incomplete: only $actual/$expected items completed\",
            \"missing\": $missing,
            \"expected\": $expected,
            \"actual\": $actual
        }"
    else
        echo "{
            \"verdict\": \"PASS\",
            \"reason\": \"All $expected items completed\",
            \"missing\": 0,
            \"expected\": $expected,
            \"actual\": $actual
        }"
    fi
}

# Archive completed session
archive_session() {
    local task_id="$1"
    local timestamp=$(date +%s)
    local archive_file="$HISTORY_DIR/${task_id}_${timestamp}.json"

    if [ -f "$SESSION_FILE" ]; then
        cp "$SESSION_FILE" "$archive_file"
        echo "Session archived to $archive_file"
    fi
}

# Update global metrics
update_metrics() {
    local verdict="$1"

    if [ ! -f "$METRICS_FILE" ]; then
        init_storage
    fi

    local metrics=$(cat "$METRICS_FILE")
    local total=$(echo "$metrics" | jq '.total_verifications')
    local passed=$(echo "$metrics" | jq '.passed')
    local failed=$(echo "$metrics" | jq '.failed')

    total=$((total + 1))

    if [ "$verdict" = "PASS" ]; then
        passed=$((passed + 1))
    else
        failed=$((failed + 1))
    fi

    echo "$metrics" | jq \
        --arg total "$total" \
        --arg passed "$passed" \
        --arg failed "$failed" \
        '.total_verifications = ($total | tonumber) |
         .passed = ($passed | tonumber) |
         .failed = ($failed | tonumber)' > "$METRICS_FILE"

    echo "Metrics updated: Total=$total, Passed=$passed, Failed=$failed"
}

# Get current session
get_session() {
    if [ -f "$SESSION_FILE" ]; then
        cat "$SESSION_FILE"
    else
        echo '{"error": "No active session"}'
    fi
}

# Get metrics
get_metrics() {
    if [ -f "$METRICS_FILE" ]; then
        cat "$METRICS_FILE"
    else
        echo '{"error": "No metrics found"}'
    fi
}

# Cleanup old history (keep last N days)
cleanup_history() {
    local days_to_keep="${1:-7}"
    find "$HISTORY_DIR" -type f -mtime +$days_to_keep -delete
    echo "Cleaned up history files older than $days_to_keep days"
}

# Main command interface
case "${1:-}" in
    init)
        init_storage
        ;;
    store)
        shift
        store_requirements "$@"
        ;;
    update)
        shift
        update_actuals "$@"
        ;;
    verdict)
        calculate_verdict
        ;;
    session)
        get_session
        ;;
    metrics)
        get_metrics
        ;;
    archive)
        shift
        archive_session "$@"
        ;;
    update-metrics)
        shift
        update_metrics "$@"
        ;;
    cleanup)
        shift
        cleanup_history "$@"
        ;;
    *)
        echo "Usage: $0 {init|store|update|verdict|session|metrics|archive|update-metrics|cleanup}"
        echo ""
        echo "Commands:"
        echo "  init                Initialize storage directories"
        echo "  store <args>        Store requirements from pre-hook"
        echo "  update <args>       Update with actuals from post-hook"
        echo "  verdict             Calculate pass/fail verdict"
        echo "  session             Get current session data"
        echo "  metrics             Get global metrics"
        echo "  archive <task_id>   Archive completed session"
        echo "  update-metrics <v>  Update global metrics with verdict"
        echo "  cleanup [days]      Clean up old history files"
        exit 1
        ;;
esac