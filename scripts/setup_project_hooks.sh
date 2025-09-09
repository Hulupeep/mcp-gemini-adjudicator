#!/bin/bash
# Setup automatic Gemini verification for any project

echo "🚀 Setting up Gemini Verification Hooks for Your Project"
echo "========================================================"
echo ""

# Get the source directory (where this script lives)
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ask for project directory if not provided
if [ -z "$1" ]; then
    read -p "Enter the full path to your project: " PROJECT_DIR
else
    PROJECT_DIR="$1"
fi

# Validate project directory
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Directory $PROJECT_DIR does not exist"
    exit 1
fi

cd "$PROJECT_DIR"
echo "📁 Setting up hooks in: $PROJECT_DIR"
echo ""

# Create .claude directory if it doesn't exist
mkdir -p .claude/hooks/attempt_counts

# Copy the hooks
echo "📋 Copying verification hooks..."
cp "$SOURCE_DIR/.claude/hooks/generate_verification_prompt.sh" .claude/hooks/
cp "$SOURCE_DIR/.claude/hooks/run_verification_direct.sh" .claude/hooks/
cp "$SOURCE_DIR/.claude/hooks/test_gemini_api.sh" .claude/hooks/

# Make them executable
chmod +x .claude/hooks/*.sh

# Update paths in the hooks to use current project directory
sed -i "s|/home/xanacan/Dropbox/code/gemini_consensus|$PROJECT_DIR|g" .claude/hooks/run_verification_direct.sh
sed -i "s|/home/xanacan/Dropbox/code/gemini_consensus|$PROJECT_DIR|g" .claude/hooks/generate_verification_prompt.sh

# Check if .claude/settings.json exists
if [ ! -f ".claude/settings.json" ]; then
    echo "📝 Creating .claude/settings.json..."
    cat > .claude/settings.json << 'EOF'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "PROJECT_DIR/.claude/hooks/generate_verification_prompt.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "WriteFile|Edit|Replace|MultiEdit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "PROJECT_DIR/.claude/hooks/run_verification_direct.sh"
          }
        ]
      }
    ]
  }
}
EOF
    # Replace PROJECT_DIR with actual path
    sed -i "s|PROJECT_DIR|$PROJECT_DIR|g" .claude/settings.json
else
    echo "⚠️  .claude/settings.json already exists"
    echo "   You may need to manually add the hooks configuration"
    echo ""
    echo "Add these hooks to your .claude/settings.json:"
    echo ""
    cat << EOF
"UserPromptSubmit": [{
  "matcher": "*",
  "hooks": [{
    "type": "command",
    "command": "$PROJECT_DIR/.claude/hooks/generate_verification_prompt.sh"
  }]
}],
"PostToolUse": [{
  "matcher": "WriteFile|Edit|Replace|MultiEdit|Write",
  "hooks": [{
    "type": "command",
    "command": "$PROJECT_DIR/.claude/hooks/run_verification_direct.sh"
  }]
}]
EOF
fi

# Copy .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "📋 Copying .env template..."
    cp "$SOURCE_DIR/.env.example" .env
    echo "⚠️  Remember to add your GEMINI_API_KEY to .env"
else
    echo "✅ .env already exists"
fi

# Create a local monitoring start script
cat > start_monitor.sh << 'EOF'
#!/bin/bash
# Start the Gemini verification monitor
cd "$(dirname "${BASH_SOURCE[0]}")"
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

# Use the monitoring server from gemini_consensus
MONITOR_PATH="SOURCE_DIR/monitoring/server.mjs"
if [ -f "$MONITOR_PATH" ]; then
    echo "🚀 Starting monitor at http://localhost:4000"
    node "$MONITOR_PATH"
else
    echo "❌ Monitor not found at $MONITOR_PATH"
    echo "Make sure gemini_consensus is installed"
fi
EOF

# Update the monitor path
sed -i "s|SOURCE_DIR|$SOURCE_DIR|g" start_monitor.sh
chmod +x start_monitor.sh

echo ""
echo "✅ Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "  1. Add your Gemini API key to .env:"
echo "     nano .env"
echo ""
echo "  2. Test the API connection:"
echo "     ./.claude/hooks/test_gemini_api.sh"
echo ""
echo "  3. Start the monitoring dashboard:"
echo "     ./start_monitor.sh"
echo ""
echo "  4. IMPORTANT: Restart Claude Desktop for hooks to take effect"
echo ""
echo "🎉 After restarting Claude, all file edits will be automatically verified!"