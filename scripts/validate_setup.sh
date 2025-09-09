#!/bin/bash
# Validate MCP Gemini Adjudicator setup

echo "🔍 MCP Gemini Adjudicator Setup Validator"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    ERRORS=$((ERRORS + 1))
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

# 1. Check Node.js version
echo "1. Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        check_pass "Node.js $NODE_VERSION installed"
    else
        check_fail "Node.js version $NODE_VERSION is too old (need 18+)"
    fi
else
    check_fail "Node.js not installed"
fi

# 2. Check npm packages
echo ""
echo "2. Checking npm dependencies..."
if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        check_pass "Dependencies installed"
    else
        check_warn "Dependencies not installed. Run: npm install"
    fi
else
    check_fail "package.json not found"
fi

# 3. Check environment configuration
echo ""
echo "3. Checking environment..."
if [ -f ".env" ]; then
    check_pass ".env file exists"
    
    # Check for API key
    if grep -q "^GEMINI_API_KEY=" .env; then
        API_KEY=$(grep "^GEMINI_API_KEY=" .env | cut -d'=' -f2)
        if [ "$API_KEY" != "your_gemini_api_key_here" ] && [ ! -z "$API_KEY" ]; then
            check_pass "Gemini API key configured"
        else
            check_fail "Gemini API key not set in .env"
        fi
    else
        check_fail "GEMINI_API_KEY not found in .env"
    fi
else
    check_warn ".env file not found. Run: cp .env.example .env"
fi

# 4. Check hooks setup
echo ""
echo "4. Checking hooks..."
HOOKS_DIR=".claude/hooks"
if [ -d "$HOOKS_DIR" ]; then
    check_pass "Hooks directory exists"
    
    # Check individual hooks
    for hook in "generate_verification_prompt.sh" "run_verification_direct.sh" "test_gemini_api.sh"; do
        if [ -f "$HOOKS_DIR/$hook" ]; then
            if [ -x "$HOOKS_DIR/$hook" ]; then
                check_pass "$hook is executable"
            else
                check_warn "$hook not executable. Run: chmod +x $HOOKS_DIR/$hook"
            fi
        else
            check_fail "$hook not found"
        fi
    done
else
    check_fail "Hooks directory not found"
fi

# 5. Check Claude settings
echo ""
echo "5. Checking Claude settings..."
if [ -f ".claude/settings.json" ]; then
    check_pass "Claude settings file exists"
    
    # Check if hooks are configured
    if grep -q "run_verification_direct.sh" .claude/settings.json; then
        check_pass "Direct API verification hook configured"
    else
        check_warn "Direct API hook not configured in settings"
    fi
else
    check_fail "Claude settings file not found"
fi

# 6. Test Gemini API connection
echo ""
echo "6. Testing Gemini API..."
if [ -f ".env" ] && [ -x ".claude/hooks/test_gemini_api.sh" ]; then
    echo "   Running API test..."
    if .claude/hooks/test_gemini_api.sh > /dev/null 2>&1; then
        check_pass "Gemini API connection successful"
    else
        check_fail "Gemini API connection failed"
    fi
else
    check_warn "Cannot test API (missing .env or test script)"
fi

# 7. Check monitoring server
echo ""
echo "7. Checking monitoring setup..."
if [ -f "monitoring/server.mjs" ]; then
    check_pass "Monitoring server found"
    
    # Check if monitor is running
    if lsof -i:4000 > /dev/null 2>&1; then
        check_pass "Monitor running on port 4000"
    else
        check_warn "Monitor not running. Run: npm run monitor"
    fi
else
    check_fail "Monitoring server not found"
fi

# 8. Check MCP server
echo ""
echo "8. Checking MCP server..."
if [ -f "index.mjs" ]; then
    check_pass "MCP server entry point found"
    
    # Check if it's registered in Claude
    check_warn "Remember to add MCP server to Claude Desktop settings"
else
    check_fail "MCP server index.mjs not found"
fi

# Summary
echo ""
echo "=========================================="
echo "Setup Validation Summary"
echo "=========================================="

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✅ All checks passed! Your setup is ready.${NC}"
    else
        echo -e "${GREEN}✅ Setup is functional with $WARNINGS warnings.${NC}"
        echo ""
        echo "To fix warnings:"
        [ ! -f ".env" ] && echo "  1. Copy .env.example to .env and add your API key"
        [ ! -d "node_modules" ] && echo "  2. Run: npm install"
        echo "  3. Start monitor: npm run monitor"
    fi
else
    echo -e "${RED}❌ Setup has $ERRORS errors that need fixing.${NC}"
    echo ""
    echo "Quick fix steps:"
    echo "  1. Copy .env.example to .env: cp .env.example .env"
    echo "  2. Add your Gemini API key to .env"
    echo "  3. Install dependencies: npm install"
    echo "  4. Make hooks executable: chmod +x .claude/hooks/*.sh"
    echo "  5. Test API: ./.claude/hooks/test_gemini_api.sh"
fi

echo ""
echo "For detailed setup instructions, see: docs/DEPLOYMENT_GUIDE.md"

exit $ERRORS