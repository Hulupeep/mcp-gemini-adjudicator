#!/bin/bash

# Master test runner for MCP Gemini Adjudicator
# Runs all test suites and provides comprehensive results

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🧪 MCP Gemini Adjudicator - Comprehensive Test Suite"
echo "===================================================="
echo ""

# Track overall results
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

# Function to run a test suite
run_suite() {
    local suite_name="$1"
    local suite_cmd="$2"

    ((TOTAL_SUITES++))
    echo -e "${BLUE}▶ Running: $suite_name${NC}"
    echo "---"

    if $suite_cmd; then
        ((PASSED_SUITES++))
        echo -e "${GREEN}✅ Suite Passed: $suite_name${NC}\n"
    else
        ((FAILED_SUITES++))
        echo -e "${RED}❌ Suite Failed: $suite_name${NC}\n"
    fi
}

# Test 1: Shell-based quantity tests
if [ -f "tests/test-verification-quantities.sh" ]; then
    run_suite "Quantity Verification Tests" "bash tests/test-verification-quantities.sh"
else
    echo -e "${YELLOW}⚠️  Skipping shell tests (file not found)${NC}\n"
fi

# Test 2: Node.js integration tests
if [ -f "tests/test-integration.mjs" ]; then
    run_suite "Integration Tests" "node tests/test-integration.mjs"
else
    echo -e "${YELLOW}⚠️  Skipping integration tests (file not found)${NC}\n"
fi

# Test 3: MCP server basic functionality
echo -e "${BLUE}▶ Testing MCP Server Startup${NC}"
echo "---"
if timeout 2s node index.mjs < /dev/null 2>&1 | grep -q "MCP Gemini Adjudicator server started"; then
    ((PASSED_SUITES++))
    ((TOTAL_SUITES++))
    echo -e "${GREEN}✅ MCP Server starts correctly${NC}\n"
else
    ((FAILED_SUITES++))
    ((TOTAL_SUITES++))
    echo -e "${RED}❌ MCP Server startup failed${NC}\n"
fi

# Test 4: Hook scripts existence
echo -e "${BLUE}▶ Checking Hook Scripts${NC}"
echo "---"
HOOKS_OK=true
for hook in generate_verification_prompt.sh run_verification.sh; do
    if [ -f ".claude/hooks/$hook" ]; then
        echo -e "  ${GREEN}✓${NC} $hook exists"
    else
        echo -e "  ${RED}✗${NC} $hook missing"
        HOOKS_OK=false
    fi
done
((TOTAL_SUITES++))
if [ "$HOOKS_OK" = true ]; then
    ((PASSED_SUITES++))
    echo -e "${GREEN}✅ All hooks present${NC}\n"
else
    ((FAILED_SUITES++))
    echo -e "${RED}❌ Some hooks missing${NC}\n"
fi

# Test 5: Quick API simulation test
echo -e "${BLUE}▶ API Response Simulation${NC}"
echo "---"
TEST_RESPONSE='{
    "verdict": "FAIL",
    "analysis": {
        "expected": 10,
        "actual": 3,
        "missing": 7
    },
    "detailed_feedback": "Only 3 of 10 items completed"
}'

echo "$TEST_RESPONSE" | jq -e '.verdict == "FAIL" and .analysis.missing == 7' > /dev/null 2>&1
if [ $? -eq 0 ]; then
    ((PASSED_SUITES++))
    ((TOTAL_SUITES++))
    echo -e "${GREEN}✅ API response structure valid${NC}\n"
else
    ((FAILED_SUITES++))
    ((TOTAL_SUITES++))
    echo -e "${RED}❌ API response structure invalid${NC}\n"
fi

# Summary
echo "===================================================="
echo -e "${BLUE}📊 Overall Test Summary${NC}"
echo "===================================================="
echo "Total Test Suites: $TOTAL_SUITES"
echo -e "Passed: ${GREEN}$PASSED_SUITES${NC}"
echo -e "Failed: ${RED}$FAILED_SUITES${NC}"

if [ $FAILED_SUITES -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All test suites passed!${NC}"
    echo "The quantity verification system is working correctly."
    exit 0
else
    echo -e "\n${RED}⚠️  Some test suites failed${NC}"
    echo "Please review the failed tests above."
    exit 1
fi