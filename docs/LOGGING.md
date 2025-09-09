# 📊 Verification Logging System

## Overview

The MCP Gemini Adjudicator includes a comprehensive logging system to help debug verification issues and understand how prompts are being parsed and verified.

## Configuration

### Enable Logging

Add to your `.env` file:
```bash
# Enable detailed verification logging
ENABLE_VERIFICATION_LOGGING=true
```

**Default**: `false` (logging disabled for performance)

## What Gets Logged

When logging is enabled, the system tracks:

### 1. User Prompts (`prompt_history.json`)
- Last 20 user prompts submitted to Claude
- Timestamp of each prompt
- Full text and length

### 2. Parsing Results (`parsing_log.json`)
- How each prompt was analyzed for verification criteria
- Task type detection (create/update/verify)
- Extracted verification criteria
- Whether verification was triggered

### 3. Gemini API Calls (`gemini_log.json`)
- All requests sent to Gemini API
- Full responses received
- Verdicts (PASS/FAIL) and confidence scores
- Criteria met/not met
- Error messages if any

### 4. File Backups (`logs/` directory)
- `last_gemini_request_*.txt` - Full request text
- `last_gemini_response_*.json` - Full API response
- `criteria_*.txt` - Extracted verification criteria

## Viewing Logs

### Quick View
```bash
# View all recent logs
./.claude/hooks/view_logs.sh

# View last 10 entries
./.claude/hooks/view_logs.sh -n 10

# View only Gemini API logs
./.claude/hooks/view_logs.sh -t gemini

# View only prompt history
./.claude/hooks/view_logs.sh -t prompts
```

### Log Types
- `prompts` - User prompt history
- `parsing` - Prompt parsing results
- `gemini` - Gemini API interactions
- `files` - Saved request/response files
- `all` - Everything (default)

### Direct Access
```bash
# View prompt history
cat .claude/hooks/prompt_history.json | jq '.'

# View Gemini calls
cat .claude/hooks/gemini_log.json | jq '.'

# View latest Gemini request
cat .claude/hooks/logs/last_gemini_request_*.txt | tail -1

# View latest Gemini response
cat .claude/hooks/logs/last_gemini_response_*.json | tail -1 | jq '.'
```

## Understanding Log Output

### Prompt Parsing
The system looks for verification keywords to determine if a task needs verification:
- **Create keywords**: create, build, implement, add, write, develop
- **Update keywords**: update, modify, change, edit, fix, improve
- **Verify keywords**: verify, ensure, check, validate, test, confirm

### Task Types
- **create** - New file/component creation
- **update** - Modification of existing code
- **verify** - Explicit verification request
- **unknown** - No clear task type detected

### Verification Flow
1. **UserPromptSubmit** - Prompt received and parsed
2. **Criteria Extraction** - Requirements identified
3. **File Edit** - Claude makes changes
4. **PostToolUse** - Verification triggered
5. **Gemini API** - Content verified against criteria
6. **Result** - PASS/FAIL with feedback

## Troubleshooting

### No Verification Triggered
Check `parsing_log.json` to see if criteria were extracted:
```bash
cat .claude/hooks/parsing_log.json | jq '.[-1]'
```

Look for:
- `is_verification_task: false` - No verification keywords found
- `criteria_extracted: "No verification criteria detected"`

### Verification Always Fails
Check `gemini_log.json` for the verdict details:
```bash
cat .claude/hooks/gemini_log.json | jq '.[-1] | {verdict, criteria_not_met}'
```

### "Unable to parse response"
This usually means:
1. HTML file was too large
2. Gemini couldn't parse the JSON response format
3. API timeout or error

Check the saved response:
```bash
ls -lt .claude/hooks/logs/last_gemini_response_*.json | head -1
cat [latest_file] | jq '.'
```

### Error 126 in Claude
This is not a real error - it means the hook ran but produced no stderr output. This happens when:
- No verification criteria exists
- API key is not configured
- Logging shows the hook is working

## Performance Impact

**With logging disabled** (default):
- Minimal overhead
- Only basic hooks.log is written
- No file backups saved

**With logging enabled**:
- ~100ms additional latency per operation
- Disk usage: ~1MB per 100 verifications
- Auto-cleanup: Only last 20 entries kept

## Privacy & Security

⚠️ **Warning**: Logs may contain sensitive information:
- Full prompt text
- File contents
- API responses

**Best Practices**:
1. Only enable logging when debugging
2. Clear logs after debugging: `rm -rf .claude/hooks/logs/`
3. Never commit logs to version control
4. Add to `.gitignore`: `.claude/hooks/*.json` and `.claude/hooks/logs/`

## Examples

### Example: Debug Why Verification Didn't Trigger

```bash
# 1. Enable logging
echo "ENABLE_VERIFICATION_LOGGING=true" >> .env

# 2. Restart Claude Code
exit
claude

# 3. Submit a prompt
"Update the header to include a search bar"

# 4. Check if criteria were extracted
./.claude/hooks/view_logs.sh -t parsing -n 1

# 5. If no criteria, check the prompt detection
cat .claude/hooks/parsing_log.json | jq '.[-1].task_type'
```

### Example: Analyze Failed Verification

```bash
# View the last Gemini verdict
./.claude/hooks/view_logs.sh -t gemini -n 1

# See what criteria weren't met
cat .claude/hooks/gemini_log.json | jq '.[-1].criteria_not_met'

# Check the actual request sent
cat .claude/hooks/logs/last_gemini_request_*.txt | tail -1
```

## Log Rotation

Logs are automatically limited:
- JSON logs: Last 20 entries only
- File backups: Manual cleanup needed

To clean up old logs:
```bash
# Remove logs older than 7 days
find .claude/hooks/logs -type f -mtime +7 -delete

# Clear all logs
rm -f .claude/hooks/*.json
rm -rf .claude/hooks/logs/
```

## Integration with Monitor

Logs complement the real-time monitor at http://localhost:4000:
- Monitor shows live verification attempts
- Logs provide detailed debugging information
- Use both together for complete visibility

## Advanced Usage

### Export Logs for Analysis
```bash
# Export all Gemini verdicts to CSV
cat .claude/hooks/gemini_log.json | jq -r '.[] | 
  select(.event == "gemini_response") | 
  [.timestamp, .file_path, .verdict, .confidence] | 
  @csv' > verification_results.csv
```

### Generate Statistics
```bash
# Count pass/fail rate
cat .claude/hooks/gemini_log.json | jq '
  [.[] | select(.verdict)] | 
  group_by(.verdict) | 
  map({verdict: .[0].verdict, count: length})'
```

### Track Problem Files
```bash
# Find files that fail most often
cat .claude/hooks/gemini_log.json | jq -r '
  [.[] | select(.verdict == "FAIL")] | 
  group_by(.file_path) | 
  map({file: .[0].file_path, failures: length}) | 
  sort_by(.failures) | 
  reverse'
```

## Hooks with Logging

The logging-enabled hooks are:
- `generate_verification_prompt_with_logging.sh` - Tracks prompt parsing
- `run_verification_with_logging.sh` - Tracks Gemini verification
- `view_logs.sh` - User-friendly log viewer

To use them, update `.claude/settings.json` to point to the logging versions.

---

Remember: **Enable logging only when debugging!** For production use, keep `ENABLE_VERIFICATION_LOGGING=false` for best performance.