# 🚀 Quick Start Guide - Get Running in 5 Minutes

## Prerequisites
- Node.js 18+
- Gemini API key from https://aistudio.google.com/app/apikey
- Claude Desktop (for MCP integration)

## Step 1: Install & Configure

```bash
# Clone the repository
git clone https://github.com/Hulupeep/mcp-gemini-adjudicator
cd mcp-gemini-adjudicator

# Install dependencies
npm install

# Set up your API key
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

## Step 2: Start the Services

### Option A: Everything at Once (Recommended)
```bash
npm run dev
```
This starts both the MCP server AND monitoring dashboard.

### Option B: Individual Services
```bash
# Terminal 1: Start MCP server
npm start

# Terminal 2: Start monitoring dashboard
npm run monitor
```

## Step 3: Open the Monitor

Open your browser to: **http://localhost:4000**

You'll see a real-time dashboard showing all verification attempts.

## Step 4: Configure Claude Desktop

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

## Step 5: Enable Automatic Verification in ANY Project ✨

**One command installs everything in your project:**

```bash
# From the mcp-gemini-adjudicator directory, run:
./scripts/install_to_project.sh /path/to/your/project

# This automatically:
# ✅ Copies all hook scripts
# ✅ Configures paths correctly  
# ✅ Sets up gemini-2.5-flash-lite
# ✅ Creates proper .claude/settings.json
# ✅ Adds validation scripts
```

**Then in your project:**
```bash
# 1. Add your API key
nano .env  # Add your GEMINI_API_KEY

# 2. Test the setup
./validate_setup.sh

# 3. Start monitoring
./start_monitor.sh

# 4. Restart Claude Code to activate hooks
```

The hooks will automatically:
- Generate verification criteria from your prompts
- Call Gemini API directly after file changes
- Show results on the monitoring dashboard
- Provide instant feedback in Claude

## 🎯 How to Use It

### In Claude, you can now:

1. **Verify any answer or code:**
   ```
   "Use verify_with_gemini to check if this code has security issues"
   ```

2. **Compare multiple AI answers:**
   ```
   "Use consensus_check to compare these two solutions"
   ```

3. **With hooks enabled**, every file change is automatically verified!

## 🔍 Verifying Everything Works

### Check MCP Server:
```bash
# Should show "MCP Gemini Adjudicator server started"
npm start
```

### Check Monitor:
```bash
# Should show "Monitoring server running at http://localhost:4000"
npm run monitor
```

### Check Hooks (if enabled):
```bash
# Watch hook activity
tail -f .claude/hooks/hooks.log

# See verification attempts on monitor
open http://localhost:4000
```

## ⚠️ Common Issues

### "GEMINI_API_KEY not set"
→ Make sure your `.env` file has: `GEMINI_API_KEY=your_actual_key`

### "Port 4000 already in use"
→ Kill existing process: `pkill -f "monitoring/server.mjs"`

### Hooks not firing
→ Make sure paths in `.claude/settings.json` are absolute, not relative

### Monitor shows no data
→ Hooks only fire when you edit files through Claude

## 📊 What You'll See

On the monitoring dashboard:
- ✅ **PASS** - Verification successful
- ❌ **FAIL** - Issues found (with detailed feedback)
- ⚠️ **SKIPPED** - No verification criteria available

## 🎉 That's It!

You now have:
- AI-powered verification for all your work
- Real-time monitoring of the verification process
- Automatic quality checks on every change

Need help? Check the full README.md or open an issue on GitHub!