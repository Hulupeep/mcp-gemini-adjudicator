# 🎯 Accurate Setup Guide - MCP Gemini Adjudicator

This guide reflects the ACTUAL steps needed to set up automatic Gemini verification in your projects.

## Prerequisites

1. **Node.js 18+** 
2. **Gemini API Key** from https://aistudio.google.com/app/apikey
3. **Claude Code CLI** (not Claude Desktop)

## Part 1: Install MCP Server (One Time)

### Step 1: Clone and Install MCP Server

```bash
# Clone the repository
git clone https://github.com/Hulupeep/mcp-gemini-adjudicator
cd mcp-gemini-adjudicator

# Install dependencies (includes @modelcontextprotocol/sdk)
npm install

# Create your .env file
cp .env.example .env
nano .env  # Add your GEMINI_API_KEY
```

### Step 2: Start the Monitoring Dashboard

```bash
# In the mcp-gemini-adjudicator directory
npm run monitor
# Opens at http://localhost:4000
```

### Step 3: Configure MCP in Claude Code

Add to Claude Desktop settings (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "gemini-adjudicator": {
      "command": "node",
      "args": ["/full/path/to/mcp-gemini-adjudicator/index.mjs"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Part 2: Set Up Hooks in Your Project

### Step 1: Create Hook Scripts Directory

```bash
cd /your/project
mkdir -p .claude/hooks/attempt_counts
```

### Step 2: Copy Hook Scripts

```bash
# Copy the working hook scripts from gemini_consensus
cp /path/to/mcp-gemini-adjudicator/.claude/hooks/generate_verification_prompt.sh .claude/hooks/
cp /path/to/mcp-gemini-adjudicator/.claude/hooks/run_verification_direct.sh .claude/hooks/
cp /path/to/mcp-gemini-adjudicator/.claude/hooks/test_gemini_api.sh .claude/hooks/

# Make them executable
chmod +x .claude/hooks/*.sh
```

### Step 3: Update Script Paths

Edit each script to use your project paths:

```bash
# In run_verification_direct.sh, update:
HOOK_DIR="/your/project/.claude/hooks"
ENV_FILE="/your/project/.env"

# In test_gemini_api.sh, update:
ENV_FILE="/your/project/.env"

# In generate_verification_prompt.sh, update:
HOOK_DIR="/your/project/.claude/hooks"
```

### Step 4: Configure .env in Your Project

```bash
# Create .env if it doesn't exist
echo "GEMINI_API_KEY=your-actual-api-key" >> .env
echo "GEMINI_MODEL=gemini-2.5-flash-lite" >> .env
```

### Step 5: Configure Claude Settings

Create or update `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/your/project/.claude/hooks/generate_verification_prompt.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "/your/project/.claude/hooks/run_verification_direct.sh"
          }
        ]
      }
    ]
  }
}
```

**CRITICAL**: Note that `UserPromptSubmit` has NO `matcher` field!

### Step 6: Fix API Endpoint for gemini-2.5-flash-lite

The scripts must use:
- API endpoint: `https://generativelanguage.googleapis.com/v1beta/` (not v1)
- Model: `gemini-2.5-flash-lite`
- Remove `"responseMimeType": "application/json"` from generation config

### Step 7: Test Your Setup

```bash
# Test API connectivity
./.claude/hooks/test_gemini_api.sh

# Should output:
# ✅ Gemini API is working!
```

## Part 3: Activate Hooks in Claude Code

**IMPORTANT**: Hooks only load when Claude Code starts!

```bash
# Exit current Claude session (Ctrl+D)
# Start new session in your project
cd /your/project
claude

# Hooks are now active!
```

## How It Works

1. **UserPromptSubmit Hook**: When you give Claude a task, `generate_verification_prompt.sh` creates verification criteria
2. **PostToolUse Hook**: When Claude edits files, `run_verification_direct.sh` sends content to Gemini API
3. **Monitoring**: Results appear at http://localhost:4000
4. **Feedback**: If verification fails, Claude sees the feedback immediately

## Common Issues & Fixes

### "No hooks for UserPromptSubmit"
- Remove the `"matcher": "*"` field from UserPromptSubmit configuration
- UserPromptSubmit doesn't use matchers!

### "API Error: responseMimeType not supported"
- Remove `"responseMimeType": "application/json"` from API calls
- Use v1beta API endpoint for gemini-2.5-flash-lite

### "Model not found"
- Use `gemini-2.5-flash-lite` with v1beta endpoint
- Or use `gemini-1.5-flash` with v1 endpoint

### Hooks not triggering
- Restart Claude Code (hooks load at startup)
- Check paths are absolute, not relative
- Verify scripts are executable: `chmod +x .claude/hooks/*.sh`

### No logs appearing
- Check `.claude/hooks/hooks.log` exists
- Monitor must be running: `npm run monitor`
- Check `MONITOR_URL` in scripts points to `http://localhost:4000/log`

## Validation Script

Run this to check everything:

```bash
#!/bin/bash
echo "Checking setup..."

# Check MCP server
if [ -d "/path/to/mcp-gemini-adjudicator" ]; then
  echo "✅ MCP server directory found"
else
  echo "❌ MCP server not found"
fi

# Check hooks
if [ -f ".claude/hooks/run_verification_direct.sh" ]; then
  echo "✅ Verification hook found"
else
  echo "❌ Verification hook missing"
fi

# Check API key
if grep -q "GEMINI_API_KEY=" .env 2>/dev/null; then
  echo "✅ API key configured"
else
  echo "❌ API key not configured"
fi

# Check settings
if grep -q "UserPromptSubmit" .claude/settings.json 2>/dev/null; then
  echo "✅ Hooks configured"
else
  echo "❌ Hooks not configured"
fi

# Test API
if ./.claude/hooks/test_gemini_api.sh 2>/dev/null | grep -q "working"; then
  echo "✅ API connection working"
else
  echo "❌ API connection failed"
fi
```

## What You Actually Get

After following these steps:
- ✅ MCP tools available (verify_with_gemini, consensus_check) for manual use
- ✅ Automatic verification on EVERY file edit
- ✅ Real-time monitoring dashboard
- ✅ Gemini 2.5-flash-lite providing instant feedback
- ✅ No manual intervention needed - fully automatic!

## Summary of Key Learnings

1. **MCP Server**: Provides tools but doesn't make them automatic
2. **Hooks**: Make verification automatic by calling Gemini API directly
3. **Claude Code**: Loads hooks at startup, not dynamically
4. **UserPromptSubmit**: Must NOT have a `matcher` field
5. **API Versions**: Use v1beta for newer models like gemini-2.5-flash-lite

---

This guide reflects the ACTUAL working setup, not the theoretical one!