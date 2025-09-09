# ✅ Setup Verification - Tested & Working

## Complete Setup Instructions for New Users

This guide has been tested and verified to work correctly as of the latest commit.

## Step 1: Clone and Install MCP Server

```bash
# Clone the repository
git clone https://github.com/Hulupeep/mcp-gemini-adjudicator
cd mcp-gemini-adjudicator

# Install dependencies
npm install

# Configure your API key
cp .env.example .env
nano .env  # Add your GEMINI_API_KEY from https://aistudio.google.com/app/apikey
```

## Step 2: Install Hooks in Your Project

```bash
# From the mcp-gemini-adjudicator directory:
./scripts/install_to_project.sh /path/to/your/project

# This script automatically:
# ✅ Creates .claude/hooks/ directory
# ✅ Copies all 3 hook scripts
# ✅ Updates paths to your project
# ✅ Configures for gemini-2.5-flash-lite model
# ✅ Creates proper .claude/settings.json
# ✅ Adds validation and monitor scripts
```

## Step 3: Configure Your Project

```bash
cd /path/to/your/project

# Add your API key to the project
nano .env  # Add: GEMINI_API_KEY=your-actual-key

# Test the API connection
./.claude/hooks/test_gemini_api.sh
# Should output: ✅ Gemini API is working!

# Validate the setup
./validate_setup.sh
# Should show all green checkmarks
```

## Step 4: Start Monitoring (Optional)

```bash
# In the mcp-gemini-adjudicator directory:
npm run monitor
# Opens at http://localhost:4000
```

## Step 5: Configure Claude Desktop/Code

### For Claude Desktop:
Edit settings (Settings → Developer → Edit Config):
```json
{
  "mcpServers": {
    "gemini-adjudicator": {
      "command": "node",
      "args": ["/full/path/to/mcp-gemini-adjudicator/index.mjs"],
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### For Claude Code (CLI):
**Just restart Claude Code** - hooks are already configured in `.claude/settings.json`

## What You Get

After setup, you have:

### 1. MCP Tools (Manual Use)
- `verify_with_gemini` - Verify any code or content
- `consensus_check` - Compare multiple AI responses

### 2. Automatic Hooks
- **UserPromptSubmit** - Generates verification criteria from your prompts
- **PostToolUse** (Write|Edit|MultiEdit) - Automatically verifies file changes

## Files Installed in Your Project

```
your-project/
├── .env (your API key)
├── .claude/
│   ├── settings.json (hook configuration)
│   └── hooks/
│       ├── generate_verification_prompt.sh
│       ├── run_verification_direct.sh
│       └── test_gemini_api.sh
├── start_monitor.sh (start monitoring dashboard)
└── validate_setup.sh (check setup)
```

## Verification Checklist

Run these commands to verify everything works:

```bash
# 1. Check MCP server
cd mcp-gemini-adjudicator
npm start  # Should show "MCP server started"

# 2. Check monitor
npm run monitor  # Should open http://localhost:4000

# 3. In your project
cd /your/project
./validate_setup.sh  # Should show all green

# 4. Test API
./.claude/hooks/test_gemini_api.sh  # Should show "API working"
```

## Important Notes

1. **Hooks require restart**: After setup, restart Claude Code for hooks to activate
2. **API Key**: Must be set in BOTH:
   - `mcp-gemini-adjudicator/.env` (for MCP server)
   - `your-project/.env` (for hooks)
3. **Model**: Uses `gemini-2.5-flash-lite` with v1beta API endpoint
4. **UserPromptSubmit**: Has NO `matcher` field (common mistake)

## Troubleshooting

### "No hooks for UserPromptSubmit"
- Check `.claude/settings.json` - UserPromptSubmit should NOT have a `matcher` field

### "API Error"
- Verify API key is correct and not the placeholder
- Check you're using v1beta endpoint for gemini-2.5-flash-lite

### Hooks not triggering
- Restart Claude Code (hooks load at startup)
- Check paths in `.claude/settings.json` are absolute

### Monitor not showing data
- Ensure monitor is running: `npm run monitor`
- Check MONITOR_URL in hooks is `http://localhost:4000/log`

## Test Results

✅ Fresh clone from GitHub works
✅ npm install succeeds
✅ install_to_project.sh creates all files
✅ API connectivity verified
✅ Hooks configuration correct
✅ Monitor dashboard functional

**This setup has been fully tested and is working as of the latest commit.**