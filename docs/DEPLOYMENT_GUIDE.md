# 🚀 Deployment & Setup Guide

## Quick Start - Automatic Verification

This guide will help you set up **automatic AI verification** that triggers on every file change in your Claude Code projects.

## Prerequisites

1. **Gemini API Key**: Get one free at https://aistudio.google.com/app/apikey
2. **Node.js 18+**: Required for MCP server and monitoring
3. **Claude Desktop**: With developer mode enabled

## Step 1: Configure Your API Key

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your Gemini API key
# Replace 'your_gemini_api_key_here' with your actual key
nano .env  # or use your preferred editor
```

Your `.env` should look like:
```env
GEMINI_API_KEY=AIzaSy...your_actual_key_here
GEMINI_MODEL=gemini-2.0-flash-exp  # Fast and efficient
```

## Step 2: Test Your Setup

```bash
# Test that Gemini API is working
./.claude/hooks/test_gemini_api.sh

# You should see:
# ✅ Gemini API is working!
# Response: {"status": "working", "message": "API connection successful"}
```

If you see an error, check:
- Your API key is correct in `.env`
- You have internet connectivity
- The API key has been activated

## Step 3: Start the Monitoring Dashboard

```bash
# Start both MCP server and monitor
npm run dev

# Or start them separately:
npm start     # Terminal 1: MCP server
npm run monitor  # Terminal 2: Dashboard
```

Open http://localhost:4000 to see the monitoring dashboard.

## Step 4: Configure Claude Desktop

### Add MCP Server

Edit Claude Desktop settings (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "gemini-adjudicator": {
      "command": "node",
      "args": ["/full/path/to/gemini_consensus/index.mjs"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Enable Automatic Verification Hooks

The hooks are already configured in `.claude/settings.json`. They will:

1. **Generate verification criteria** when you submit a prompt
2. **Verify changes automatically** after any file edit
3. **Show results** on the monitoring dashboard
4. **Provide feedback** directly in Claude if verification fails

## How It Works

### Architecture

```
User Prompt → Claude Code → File Edit
                ↓
        PostToolUse Hook
                ↓
    run_verification_direct.sh
                ↓
        Gemini API (Direct)
                ↓
    Verification Result → Monitor Dashboard
                ↓
    Feedback → Claude (if failed)
```

### Key Components

1. **generate_verification_prompt.sh**: Creates verification criteria from your task
2. **run_verification_direct.sh**: Calls Gemini API directly for verification
3. **Monitoring Dashboard**: Real-time view of all verifications
4. **MCP Tools**: Available for manual verification when needed

## Verification Flow

1. **You give Claude a task**: "Create a function to calculate prime numbers"
2. **Hook generates criteria**: Automatically creates a checklist
3. **Claude writes code**: Implements the solution
4. **Automatic verification**: Gemini checks if criteria are met
5. **Instant feedback**: See results on dashboard, failures shown in Claude

## Testing the Integration

### Test 1: Simple Task

```bash
# In Claude, type:
"Create a file called test.txt with the text 'Hello World'"

# Watch the monitor at http://localhost:4000
# You should see the verification attempt
```

### Test 2: Code Task

```bash
# In Claude, type:
"Create a function in test.js that adds two numbers"

# Monitor will show:
# - Task ID: test.js
# - Status: PASS or FAIL
# - Feedback from Gemini
```

## Troubleshooting

### "GEMINI_API_KEY not configured"
- Check `.env` file exists and contains your key
- Ensure no quotes around the API key
- Restart the hooks by reopening Claude

### "No verification criteria available"
- The prompt generation hook may have failed
- Check `.claude/hooks/hooks.log` for errors
- Ensure hooks have execute permissions

### Monitor shows no data
- Ensure monitor is running: `npm run monitor`
- Check if hooks are firing: `tail -f .claude/hooks/hooks.log`
- Verify file paths in `.claude/settings.json` are absolute

### Hooks not triggering
- Ensure you're editing files through Claude (not external editor)
- Check hook permissions: `chmod +x .claude/hooks/*.sh`
- Verify paths in `.claude/settings.json` are correct

## Advanced Configuration

### Adjusting Verification Strictness

Edit `.claude/hooks/run_verification_direct.sh`:

```bash
# Change temperature (0.0 = strict, 1.0 = lenient)
"temperature": 0.1,  # Very strict by default
```

### Custom Verification Prompts

You can manually create verification criteria:

```bash
echo "Must have error handling
Must include type hints
Must have docstrings" > .claude/hooks/last_verification_prompt.txt
```

### Disable Automatic Verification

To temporarily disable, comment out the hook in `.claude/settings.json`:

```json
"PostToolUse": [
  // {
  //   "matcher": "WriteFile|Edit|Replace|MultiEdit",
  //   "hooks": [...]
  // }
]
```

## Security Notes

- **Never commit `.env`**: It's in `.gitignore` for safety
- **API keys are local**: Only used by your local hooks
- **No data leaves your machine**: Except API calls to Gemini
- **Monitor is localhost only**: Not accessible externally

## Performance Tips

- **gemini-2.0-flash-exp**: Fastest model, good for most tasks
- **gemini-1.5-pro**: More thorough but slower
- **Batch verifications**: Group related changes together

## Integration with CI/CD

You can also use the MCP tools in CI/CD pipelines:

```yaml
# .github/workflows/verify.yml
- name: Verify with Gemini
  run: |
    npx @anthropic/mcp-cli run gemini-adjudicator verify_with_gemini \
      --prompt "Check for security issues" \
      --artifact "@file:src/main.js"
```

## Support

- **Issues**: https://github.com/Hulupeep/mcp-gemini-adjudicator/issues
- **Logs**: Check `.claude/hooks/hooks.log` for debugging
- **Monitor**: http://localhost:4000 shows real-time status

---

## 🎉 You're All Set!

Your Claude Code now has:
- ✅ Automatic AI verification on every change
- ✅ Real-time monitoring dashboard
- ✅ Direct Gemini API integration (no manual steps)
- ✅ Instant feedback on failures

Start coding and watch Gemini verify your work automatically!