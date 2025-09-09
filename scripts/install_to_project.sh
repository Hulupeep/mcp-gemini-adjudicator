#!/bin/bash
# Complete installation script for MCP Gemini Adjudicator with hooks
# This script sets up EVERYTHING needed for automatic verification

set -e

echo "🚀 MCP Gemini Adjudicator - Complete Project Setup"
echo "=================================================="
echo ""

# Get the directory where this script is located (gemini_consensus/scripts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Get target project directory
if [ -z "$1" ]; then
    read -p "Enter the full path to your project directory: " PROJECT_DIR
else
    PROJECT_DIR="$1"
fi

# Validate project directory
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ Directory $PROJECT_DIR does not exist${NC}"
    exit 1
fi

cd "$PROJECT_DIR"
echo -e "${GREEN}📁 Setting up in: $PROJECT_DIR${NC}"
echo ""

# Step 2: Create necessary directories
echo "Creating directories..."
mkdir -p .claude/hooks/attempt_counts
mkdir -p scripts

# Step 3: Copy all hook scripts
echo "Installing hook scripts..."
cp "$SOURCE_DIR/.claude/hooks/generate_verification_prompt.sh" .claude/hooks/
cp "$SOURCE_DIR/.claude/hooks/run_verification_advanced.sh" .claude/hooks/
cp "$SOURCE_DIR/.claude/hooks/test_gemini_api.sh" .claude/hooks/
# Keep the direct version as backup
cp "$SOURCE_DIR/.claude/hooks/run_verification_direct.sh" .claude/hooks/

# Make them executable
chmod +x .claude/hooks/*.sh

# Step 4: Update paths in hook scripts to use current project
echo "Configuring hook scripts for your project..."
sed -i "s|/home/xanacan/Dropbox/code/gemini_consensus|$PROJECT_DIR|g" .claude/hooks/*.sh
sed -i "s|/home/xanacan/Dropbox/code/floutlabsweb|$PROJECT_DIR|g" .claude/hooks/*.sh

# Step 5: Fix API configuration for gemini-2.5-flash-lite
echo "Configuring for gemini-2.5-flash-lite model..."
sed -i 's/gemini-2.0-flash-exp/gemini-2.5-flash-lite/g' .claude/hooks/*.sh
sed -i 's|https://generativelanguage.googleapis.com/v1/|https://generativelanguage.googleapis.com/v1beta/|g' .claude/hooks/*.sh
sed -i '/"responseMimeType": "application\/json"/d' .claude/hooks/*.sh
sed -i 's/"maxOutputTokens": 100,/"maxOutputTokens": 100/g' .claude/hooks/test_gemini_api.sh
sed -i 's/"maxOutputTokens": 1024,/"maxOutputTokens": 1024/g' .claude/hooks/run_verification_direct.sh

# Step 6: Create or update .env file
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOF
# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite

# Monitoring Configuration
MONITOR_URL=http://localhost:4000/log
EOF
    echo -e "${YELLOW}⚠️  Remember to add your GEMINI_API_KEY to .env${NC}"
else
    echo ".env already exists - checking for API key..."
    if ! grep -q "GEMINI_API_KEY=" .env; then
        echo "" >> .env
        echo "# Gemini API Configuration" >> .env
        echo "GEMINI_API_KEY=your_gemini_api_key_here" >> .env
        echo "GEMINI_MODEL=gemini-2.5-flash-lite" >> .env
        echo -e "${YELLOW}⚠️  Added GEMINI_API_KEY to .env - please update it${NC}"
    fi
fi

# Step 7: Create .claude/settings.json with correct format
echo "Configuring Claude Code hooks..."
if [ ! -f ".claude/settings.json" ]; then
    cat > .claude/settings.json << EOF
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$PROJECT_DIR/.claude/hooks/generate_verification_prompt.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|Replace",
        "hooks": [
          {
            "type": "command",
            "command": "$PROJECT_DIR/.claude/hooks/run_verification_advanced.sh"
          }
        ]
      }
    ]
  }
}
EOF
    echo -e "${GREEN}✅ Created .claude/settings.json with hooks${NC}"
else
    echo -e "${YELLOW}⚠️  .claude/settings.json already exists${NC}"
    echo "   You may need to manually add the hooks configuration."
    echo ""
    echo "   Required configuration (NO matcher field for UserPromptSubmit!):"
    cat << EOF

"hooks": {
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "$PROJECT_DIR/.claude/hooks/generate_verification_prompt.sh"
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "Write|Edit|MultiEdit|Replace",
      "hooks": [
        {
          "type": "command",
          "command": "$PROJECT_DIR/.claude/hooks/run_verification_direct.sh"
        }
      ]
    }
  ]
}
EOF
fi

# Step 8: Create a monitor start script
echo "Creating monitor start script..."
cat > start_monitor.sh << EOF
#!/bin/bash
# Start the Gemini verification monitor
echo "🚀 Starting Gemini Verification Monitor..."
echo "Dashboard will be available at http://localhost:4000"
echo ""

# Check if monitor is already running
if lsof -i:4000 > /dev/null 2>&1; then
    echo "⚠️  Monitor already running on port 4000"
    exit 0
fi

# Start the monitor from gemini_consensus
MONITOR_PATH="$SOURCE_DIR/monitoring/server.mjs"
if [ -f "\$MONITOR_PATH" ]; then
    cd "$SOURCE_DIR"
    npm run monitor
else
    echo "❌ Monitor not found at \$MONITOR_PATH"
    echo "Make sure gemini_consensus is installed at: $SOURCE_DIR"
    exit 1
fi
EOF
chmod +x start_monitor.sh

# Step 9: Create validation script
echo "Creating validation script..."
cat > validate_setup.sh << EOF
#!/bin/bash
# Validate the MCP Gemini setup

echo "🔍 Validating MCP Gemini Setup"
echo "=============================="
echo ""

ERRORS=0
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check hooks directory
if [ -d ".claude/hooks" ]; then
    echo -e "\${GREEN}✅ Hooks directory exists\${NC}"
else
    echo -e "\${RED}❌ Hooks directory missing\${NC}"
    ERRORS=\$((ERRORS + 1))
fi

# Check hook scripts
for script in generate_verification_prompt.sh run_verification_direct.sh test_gemini_api.sh; do
    if [ -x ".claude/hooks/\$script" ]; then
        echo -e "\${GREEN}✅ \$script is executable\${NC}"
    else
        echo -e "\${RED}❌ \$script missing or not executable\${NC}"
        ERRORS=\$((ERRORS + 1))
    fi
done

# Check .env file
if [ -f ".env" ]; then
    if grep -q "^GEMINI_API_KEY=" .env && ! grep -q "^GEMINI_API_KEY=your_gemini_api_key_here" .env; then
        echo -e "\${GREEN}✅ API key configured\${NC}"
    else
        echo -e "\${YELLOW}⚠️  API key not configured in .env\${NC}"
    fi
else
    echo -e "\${RED}❌ .env file not found\${NC}"
    ERRORS=\$((ERRORS + 1))
fi

# Check settings.json
if [ -f ".claude/settings.json" ]; then
    if grep -q "UserPromptSubmit" .claude/settings.json; then
        echo -e "\${GREEN}✅ Hooks configured in settings.json\${NC}"
    else
        echo -e "\${RED}❌ Hooks not configured in settings.json\${NC}"
        ERRORS=\$((ERRORS + 1))
    fi
else
    echo -e "\${RED}❌ .claude/settings.json not found\${NC}"
    ERRORS=\$((ERRORS + 1))
fi

# Test API if configured
if [ -f ".env" ] && grep -q "^GEMINI_API_KEY=" .env && ! grep -q "=your_gemini_api_key_here" .env; then
    echo ""
    echo "Testing Gemini API connection..."
    if ./.claude/hooks/test_gemini_api.sh > /dev/null 2>&1; then
        echo -e "\${GREEN}✅ API connection successful\${NC}"
    else
        echo -e "\${RED}❌ API connection failed\${NC}"
        ERRORS=\$((ERRORS + 1))
    fi
fi

echo ""
if [ \$ERRORS -eq 0 ]; then
    echo -e "\${GREEN}✅ All checks passed! Setup is complete.\${NC}"
else
    echo -e "\${RED}❌ Setup has \$ERRORS errors that need fixing.\${NC}"
fi
EOF
chmod +x validate_setup.sh

# Step 10: Final summary
echo ""
echo "=================================================="
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo "=================================================="
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Add your Gemini API key:"
echo "   nano .env"
echo "   (Replace 'your_gemini_api_key_here' with your actual key)"
echo ""
echo "2. Test the API connection:"
echo "   ./.claude/hooks/test_gemini_api.sh"
echo ""
echo "3. Start the monitoring dashboard:"
echo "   ./start_monitor.sh"
echo "   (Opens at http://localhost:4000)"
echo ""
echo "4. Validate your setup:"
echo "   ./validate_setup.sh"
echo ""
echo "5. IMPORTANT: Restart Claude Code for hooks to activate:"
echo "   Exit current session (Ctrl+D)"
echo "   Then: cd $PROJECT_DIR && claude"
echo ""
echo "=================================================="
echo "After restarting Claude Code:"
echo "- Every prompt generates verification criteria"
echo "- Every file edit is automatically verified"
echo "- Results appear on the monitoring dashboard"
echo "- Failed verifications show feedback in Claude"
echo "=================================================="