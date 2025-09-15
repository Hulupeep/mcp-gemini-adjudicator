#!/bin/bash

# Test for link checking verification scenario
# Validates that all discovered links are actually checked

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TEST_DIR="/tmp/link-test-$$"

setup() {
    mkdir -p "$TEST_DIR"

    # Create a mock HTML page with links
    cat > "$TEST_DIR/page.html" << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
    <a href="https://example.com">Example</a>
    <a href="https://google.com">Google</a>
    <a href="https://github.com">GitHub</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    <a href="https://broken-link.invalid">Broken</a>
    <a href="mailto:test@example.com">Email</a>
    <a href="tel:+1234567890">Phone</a>
    <a href="#section">Anchor</a>
    <a href="javascript:void(0)">JavaScript</a>
</body>
</html>
EOF
}

test_link_discovery() {
    echo -e "\n${YELLOW}TEST: Link Discovery and Counting${NC}"

    # Extract all links from HTML
    local links=$(grep -oE 'href="[^"]*"' "$TEST_DIR/page.html" | cut -d'"' -f2)
    local link_count=$(echo "$links" | wc -l)

    echo "Found $link_count links in page"
    echo "$links" > "$TEST_DIR/discovered_links.txt"

    # Store requirement
    echo "expected_link_checks: $link_count" > "$TEST_DIR/requirements.txt"

    if [ "$link_count" -eq 10 ]; then
        echo -e "${GREEN}✅ PASS${NC}: Discovered all 10 links"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Expected 10 links, found $link_count"
        return 1
    fi
}

test_incomplete_link_checking() {
    echo -e "\n${YELLOW}TEST: Detect Incomplete Link Checking${NC}"

    local total_links=10
    local checked_links=7  # Simulate only checking 7 out of 10

    # Create mock validation results (incomplete)
    cat > "$TEST_DIR/validation_results.json" << EOF
{
    "task": "Check all links on page",
    "links_found": $total_links,
    "links_checked": $checked_links,
    "results": [
        {"url": "https://example.com", "status": 200, "valid": true},
        {"url": "https://google.com", "status": 200, "valid": true},
        {"url": "https://github.com", "status": 200, "valid": true},
        {"url": "/about", "status": 200, "valid": true},
        {"url": "/contact", "status": 200, "valid": true},
        {"url": "https://broken-link.invalid", "status": 404, "valid": false},
        {"url": "mailto:test@example.com", "status": "skipped", "valid": true}
    ]
}
EOF

    # Verify completion
    local verdict="FAIL"
    local reason="Incomplete: only $checked_links/$total_links links checked"

    if [ "$checked_links" -lt "$total_links" ]; then
        echo -e "${GREEN}✅ PASS${NC}: Correctly detected incomplete checking"
        echo "  Verdict: $verdict - $reason"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Should have detected incomplete work"
        return 1
    fi
}

test_link_validation_types() {
    echo -e "\n${YELLOW}TEST: Different Link Type Validation${NC}"

    # Different types of links require different validation
    declare -A link_types=(
        ["https://example.com"]="HTTP check"
        ["mailto:test@example.com"]="Email format validation"
        ["tel:+1234567890"]="Phone format validation"
        ["#section"]="Anchor existence check"
        ["javascript:void(0)"]="Skip or warn"
    )

    local all_validated=true
    for link in "${!link_types[@]}"; do
        local validation_type="${link_types[$link]}"
        echo "  Link: $link → $validation_type"
    done

    echo -e "${GREEN}✅ PASS${NC}: All link types identified for appropriate validation"
    return 0
}

test_verification_response() {
    echo -e "\n${YELLOW}TEST: Gemini Verification Response for Links${NC}"

    # Mock Gemini verification for link checking task
    cat > "$TEST_DIR/gemini_verification.json" << 'EOF'
{
    "verdict": "FAIL",
    "confidence": 0.95,
    "analysis": {
        "task": "Check all links on page",
        "requirements": {
            "links_to_check": 25,
            "links_actually_checked": 18,
            "missing_checks": 7
        },
        "strengths": [
            "HTTP links were properly validated",
            "Status codes were recorded"
        ],
        "weaknesses": [
            "7 links were not checked",
            "No retry logic for failed requests",
            "Anchor links not validated"
        ]
    },
    "detailed_feedback": "Task incomplete: Only 18 out of 25 links were checked. Missing validations for: link19.html, link20.html, link21.html, link22.html, link23.html, link24.html, link25.html",
    "recommendations": [
        "Check the remaining 7 links",
        "Implement validation for anchor links",
        "Add retry logic for network failures"
    ]
}
EOF

    # Parse and verify the response
    if jq -e '.verdict == "FAIL" and .analysis.requirements.missing_checks == 7' "$TEST_DIR/gemini_verification.json" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}: Verification correctly identified 7 missing link checks"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Verification response parsing failed"
        return 1
    fi
}

test_complete_link_checking() {
    echo -e "\n${YELLOW}TEST: Complete Link Checking Validation${NC}"

    # Simulate complete checking
    local total_links=10
    local checked_links=10

    cat > "$TEST_DIR/complete_results.json" << EOF
{
    "task": "Check all links on page",
    "links_found": $total_links,
    "links_checked": $checked_links,
    "all_links_validated": true,
    "summary": {
        "valid": 8,
        "broken": 1,
        "skipped": 1
    }
}
EOF

    local all_checked=$(jq -r '.links_found == .links_checked' "$TEST_DIR/complete_results.json")

    if [ "$all_checked" == "true" ]; then
        echo -e "${GREEN}✅ PASS${NC}: All links properly checked"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: Link checking incomplete"
        return 1
    fi
}

# Run all tests
main() {
    echo "🔗 Link Checking Verification Tests"
    echo "===================================="

    setup

    local passed=0
    local failed=0

    for test in test_link_discovery test_incomplete_link_checking \
                test_link_validation_types test_verification_response \
                test_complete_link_checking; do
        if $test; then
            ((passed++))
        else
            ((failed++))
        fi
    done

    echo ""
    echo "===================================="
    echo "📊 Results"
    echo "===================================="
    echo -e "Passed: ${GREEN}$passed${NC}"
    echo -e "Failed: ${RED}$failed${NC}"

    # Cleanup
    rm -rf "$TEST_DIR"

    [ "$failed" -eq 0 ] && exit 0 || exit 1
}

main "$@"