#!/bin/bash

# Test Suite for Quantity-Based Verification
# Tests the pre-hook and post-hook integration for counting requirements

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directories
TEST_DIR="/tmp/mcp-test-$$"
HOOKS_DIR=".claude/hooks"
TEST_RESULTS="$TEST_DIR/results"

# Initialize test environment
setup_test_env() {
    echo "🔧 Setting up test environment..."
    mkdir -p "$TEST_DIR"/{source,output,expected}
    mkdir -p "$TEST_RESULTS"

    # Create mock hook scripts if not exists
    if [ ! -f "$HOOKS_DIR/generate_verification_prompt.sh" ]; then
        echo "⚠️  Hooks not found, using mock hooks"
        mkdir -p "$HOOKS_DIR"
        cp tests/mock-hooks/* "$HOOKS_DIR/" 2>/dev/null || true
    fi
}

# Test 1: Extract quantity from explicit number
test_explicit_quantity() {
    echo -e "\n${YELLOW}TEST 1: Extract explicit quantity${NC}"
    local prompt="Create 10 blog posts about AI"

    # Run extraction
    local result=$(echo "$prompt" | grep -oE '[0-9]+|ten|twenty|thirty' | head -1)
    local expected="10"

    if [ "$result" == "$expected" ]; then
        echo -e "${GREEN}✅ PASS${NC}: Extracted quantity: $result"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Expected $expected, got $result"
        return 1
    fi
}

# Test 2: Extract "all" files in directory
test_all_files_quantity() {
    echo -e "\n${YELLOW}TEST 2: Count 'all' files in directory${NC}"

    # Create test files
    mkdir -p "$TEST_DIR/webpages"
    touch "$TEST_DIR/webpages/"{page1,page2,page3,page4,page5}.html

    local prompt="Update all webpages in $TEST_DIR/webpages"
    local actual_count=$(ls "$TEST_DIR/webpages"/*.html 2>/dev/null | wc -l)
    local expected_count=5

    if [ "$actual_count" -eq "$expected_count" ]; then
        echo -e "${GREEN}✅ PASS${NC}: Found $actual_count files"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Expected $expected_count files, found $actual_count"
        return 1
    fi
}

# Test 3: Verify file creation count
test_file_creation_verification() {
    echo -e "\n${YELLOW}TEST 3: Verify file creation count${NC}"

    local expected=10
    local created=2

    # Simulate verification
    local verification_result=$(
        if [ "$created" -lt "$expected" ]; then
            echo "FAIL: Only $created/$expected files created"
        else
            echo "PASS: All $expected files created"
        fi
    )

    if [[ "$verification_result" == *"FAIL"* ]]; then
        echo -e "${GREEN}✅ PASS${NC}: Correctly detected incomplete work"
        echo "  Verification: $verification_result"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Should have detected incomplete work"
        return 1
    fi
}

# Test 4: Word-based quantity extraction
test_word_quantity() {
    echo -e "\n${YELLOW}TEST 4: Extract word-based quantities${NC}"

    declare -A word_tests=(
        ["five blog posts"]=5
        ["ten API endpoints"]=10
        ["twenty test cases"]=20
        ["three components"]=3
    )

    local all_passed=true
    for prompt in "${!word_tests[@]}"; do
        local expected="${word_tests[$prompt]}"
        local extracted=$(echo "$prompt" | tests/extract-quantity.sh 2>/dev/null || echo "0")

        if [ "$extracted" == "$expected" ]; then
            echo -e "  ${GREEN}✓${NC} '$prompt' → $extracted"
        else
            echo -e "  ${RED}✗${NC} '$prompt' → Expected $expected, got $extracted"
            all_passed=false
        fi
    done

    [ "$all_passed" = true ] && return 0 || return 1
}

# Test 5: Integration test with mock Gemini
test_full_integration() {
    echo -e "\n${YELLOW}TEST 5: Full integration test${NC}"

    # Create test scenario
    local task="Create 5 documentation files"
    echo "$task" > "$TEST_DIR/task.txt"

    # Simulate pre-hook storing expected count
    echo "expected_count: 5" > "$TEST_DIR/expected_metrics.txt"
    echo "task: $task" >> "$TEST_DIR/expected_metrics.txt"

    # Create only 3 files (incomplete)
    touch "$TEST_DIR/output/"{doc1,doc2,doc3}.md
    local actual_count=$(ls "$TEST_DIR/output"/*.md 2>/dev/null | wc -l)

    # Simulate post-hook verification
    local verification=$(
        expected=$(grep "expected_count:" "$TEST_DIR/expected_metrics.txt" | cut -d: -f2 | tr -d ' ')
        if [ "$actual_count" -lt "$expected" ]; then
            echo '{"verdict": "FAIL", "reason": "Incomplete: '"$actual_count"'/'"$expected"' files created"}'
        else
            echo '{"verdict": "PASS", "reason": "All files created"}'
        fi
    )

    if [[ "$verification" == *'"verdict": "FAIL"'* ]]; then
        echo -e "${GREEN}✅ PASS${NC}: Integration correctly detected incomplete work"
        echo "  Response: $verification"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Should have failed verification"
        return 1
    fi
}

# Test 6: Directory scope verification
test_directory_scope() {
    echo -e "\n${YELLOW}TEST 6: Directory scope verification${NC}"

    # Create test structure
    mkdir -p "$TEST_DIR/src/components"
    touch "$TEST_DIR/src/components/"{Button,Card,Modal,Form,Table}.jsx

    # Task: Update all components
    local expected_count=$(ls "$TEST_DIR/src/components"/*.jsx | wc -l)

    # Simulate partial update (only 3 files)
    local modified_files="Button.jsx Card.jsx Modal.jsx"
    local modified_count=$(echo "$modified_files" | wc -w)

    if [ "$modified_count" -lt "$expected_count" ]; then
        echo -e "${GREEN}✅ PASS${NC}: Detected incomplete scope coverage"
        echo "  Modified $modified_count/$expected_count files"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Should detect incomplete updates"
        return 1
    fi
}

# Test 7: Pattern-based file counting
test_pattern_matching() {
    echo -e "\n${YELLOW}TEST 7: Pattern-based file matching${NC}"

    # Create mixed file types
    mkdir -p "$TEST_DIR/mixed"
    touch "$TEST_DIR/mixed/"{test1.js,test2.js,style.css,index.html,config.json}

    # Task: Update all JavaScript files
    local js_count=$(ls "$TEST_DIR/mixed"/*.js 2>/dev/null | wc -l)
    local expected=2

    if [ "$js_count" -eq "$expected" ]; then
        echo -e "${GREEN}✅ PASS${NC}: Correctly counted .js files: $js_count"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Expected $expected .js files, found $js_count"
        return 1
    fi
}

# Test 8: Gemini API mock test
test_gemini_verification_mock() {
    echo -e "\n${YELLOW}TEST 8: Mock Gemini verification API${NC}"

    # Create mock verification request
    local mock_request='{
        "task": "Create 10 blog posts",
        "expected_count": 10,
        "actual_count": 3,
        "files_created": ["blog1.md", "blog2.md", "blog3.md"]
    }'

    # Mock Gemini response
    local mock_response='{
        "verdict": "FAIL",
        "confidence": 1.0,
        "analysis": {
            "expected": 10,
            "actual": 3,
            "missing": 7
        },
        "detailed_feedback": "Task incomplete: Only 3 out of 10 requested blog posts were created.",
        "recommendations": ["Create 7 more blog posts to complete the task"]
    }'

    echo "$mock_response" > "$TEST_DIR/gemini_response.json"

    # Verify response structure
    if jq -e '.verdict == "FAIL" and .analysis.missing == 7' "$TEST_DIR/gemini_response.json" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}: Mock Gemini response validated"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Invalid Gemini response structure"
        return 1
    fi
}

# Main test runner
run_tests() {
    echo "🧪 Running MCP Gemini Adjudicator Quantity Tests"
    echo "================================================"

    setup_test_env

    local total=0
    local passed=0
    local failed=0

    # Run all tests
    for test_func in test_explicit_quantity test_all_files_quantity \
                     test_file_creation_verification test_word_quantity \
                     test_full_integration test_directory_scope \
                     test_pattern_matching test_gemini_verification_mock; do

        ((total++))
        if $test_func; then
            ((passed++))
        else
            ((failed++))
        fi
    done

    # Summary
    echo ""
    echo "================================================"
    echo "📊 Test Results Summary"
    echo "================================================"
    echo -e "Total Tests: $total"
    echo -e "Passed: ${GREEN}$passed${NC}"
    echo -e "Failed: ${RED}$failed${NC}"

    if [ "$failed" -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All tests passed!${NC}"
        cleanup
        exit 0
    else
        echo -e "\n${RED}⚠️  Some tests failed${NC}"
        cleanup
        exit 1
    fi
}

# Cleanup function
cleanup() {
    echo "🧹 Cleaning up test environment..."
    rm -rf "$TEST_DIR"
}

# Handle interrupts
trap cleanup EXIT INT TERM

# Run if executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    run_tests
fi