# 🔄 Automatic Retry Mechanism

## Overview

The advanced verification hook now includes **automatic retry on failure**, ensuring Claude fixes any issues found by Gemini before moving on.

## How It Works

### Previous Behavior (run_verification_direct.sh)
- ❌ **Exit code 0** on failure → Claude continued despite issues
- ⚠️ Feedback was shown but not enforced
- 😔 Failed verifications were ignored

### New Behavior (run_verification_advanced.sh)
- ✅ **JSON output with "decision": "block"** → Forces Claude to retry
- 🔄 Automatic retry with specific feedback
- 🎯 Continues until verification passes

## Technical Details

### JSON Output Structure
When verification fails, the hook returns:
```json
{
  "decision": "block",
  "reason": "Detailed feedback about what needs fixing",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Attempt 2 failed. Please fix the issues..."
  }
}
```

### Claude's Response
1. **Receives blocking feedback** via JSON output
2. **Parses the issues** from the reason field
3. **Automatically retries** the file edit
4. **Repeats until PASS** verdict achieved

## Key Improvements

### 1. Structured Feedback
- Detailed error messages
- Specific recommendations
- Attempt tracking

### 2. Smart Retry Logic
- Counts attempts
- Provides context about retry number
- Cleans up on success

### 3. Better Integration
- Uses Claude Code's JSON protocol
- Works with PostToolUse hooks
- Compatible with monitoring dashboard

## Configuration

The advanced hook is automatically installed when you run:
```bash
./scripts/install_to_project.sh /your/project
```

It replaces the previous `run_verification_direct.sh` with `run_verification_advanced.sh`.

## Testing the Retry Mechanism

1. **Create a file with intentional issues:**
```javascript
// Missing error handling and validation
function calculate(a, b) {
  return a + b;
}
```

2. **Watch the monitor** at http://localhost:4000

3. **See Claude automatically fix issues:**
- First attempt: FAIL - "Missing error handling"
- Second attempt: FAIL - "Missing input validation"  
- Third attempt: PASS - All issues resolved

## Exit Codes vs JSON Output

### Exit Code Method (Limited)
- Exit 0: Success
- Exit 2: Send stderr to Claude
- Other: Show error to user

### JSON Output Method (Recommended)
- More control over Claude's behavior
- Explicit "block" decision
- Detailed feedback structure
- Better retry handling

## Files Updated

- `run_verification_advanced.sh` - New advanced hook with retry
- `install_to_project.sh` - Updated to install advanced hook
- `.claude/settings.json` - Points to advanced hook

## Important Notes

1. **Restart Required**: Hooks load at Claude Code startup
2. **Attempt Tracking**: Each retry is counted and logged
3. **Monitor Integration**: All attempts visible on dashboard
4. **Automatic Cleanup**: Success removes verification criteria

## Benefits

- 🚀 **100% Task Completion**: No more partial work
- 🎯 **Quality Enforcement**: Standards are met, not suggested
- 🔄 **Automatic Correction**: Claude fixes issues without manual intervention
- 📊 **Full Visibility**: Monitor shows all retry attempts

## Migration

To upgrade existing projects:
```bash
# Copy the new hook
cp /path/to/gemini_consensus/.claude/hooks/run_verification_advanced.sh \
   /your/project/.claude/hooks/

# Update settings.json to use run_verification_advanced.sh
nano /your/project/.claude/settings.json

# Restart Claude Code
```

The retry mechanism ensures that **verification failures are fixed**, not ignored!