#!/bin/bash

# Phase 3 Test Script - Link & API Verification
set -e

echo "==========================================="
echo "Phase 3 Test: Link & API Verification"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Setup
TASK_ID="T_links_1"
ARTIFACTS_DIR=".artifacts/$TASK_ID"

# Clean up previous test
echo -e "${YELLOW}Cleaning up previous test...${NC}"
rm -rf "$ARTIFACTS_DIR"
mkdir -p "$ARTIFACTS_DIR/links"

echo -e "${GREEN}✓ Setup complete${NC}"
echo ""

# Part 1: Link Verification Test
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Part 1: Link Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Step 1: Create test HTML file with links
echo -e "${YELLOW}Creating test HTML file with links...${NC}"
cat > test-page.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>Test Links</h1>
    <a href="https://www.google.com">Google (should pass)</a>
    <a href="https://httpstat.us/200">HTTP 200 OK</a>
    <a href="https://httpstat.us/404">HTTP 404 Not Found</a>
    <a href="https://httpstat.us/500">HTTP 500 Server Error</a>
    <a href="https://httpstat.us/301">HTTP 301 Redirect</a>
    <a href="https://invalid-domain-that-does-not-exist-12345.com">Invalid Domain</a>
    <a href="https://github.com">GitHub</a>
    <a href="https://example.com">Example</a>
</body>
</html>
EOF
echo -e "${GREEN}✓ Test HTML created${NC}"

# Step 2: Create commitment
echo -e "${YELLOW}Creating link check commitment...${NC}"
cat > "$ARTIFACTS_DIR/commitment.json" << EOF
{
  "task_id": "$TASK_ID",
  "type": "link_check",
  "profile": "link_check",
  "user_instruction": "Check all links on the page",
  "commitments": {
    "expected_total": 8,
    "scope": {
      "target_url": "test-page.html"
    }
  }
}
EOF
echo -e "${GREEN}✓ Commitment created${NC}"

# Step 3: Create claim
echo -e "${YELLOW}Creating claim...${NC}"
cat > "$ARTIFACTS_DIR/claim.json" << EOF
{
  "task_id": "$TASK_ID",
  "claimed": {
    "type": "link_check",
    "units_total": 8,
    "source_url": "test-page.html",
    "files_modified": ["test-page.html"],
    "notes": "Checking all links on the page"
  }
}
EOF
echo -e "${GREEN}✓ Claim created${NC}"

# Step 4: Discover links
echo -e "${YELLOW}Discovering links...${NC}"

# Manually create urlset from our test file
cat > "$ARTIFACTS_DIR/links/urlset.json" << EOF
[
  "https://www.google.com",
  "https://httpstat.us/200",
  "https://httpstat.us/404",
  "https://httpstat.us/500",
  "https://httpstat.us/301",
  "https://invalid-domain-that-does-not-exist-12345.com",
  "https://github.com",
  "https://example.com"
]
EOF

echo -e "${GREEN}✓ Discovered 8 links${NC}"

# Step 5: Check links
echo -e "${YELLOW}Checking links...${NC}"
adapters/links/bin/adapter-links links:check \
    --task-dir "$ARTIFACTS_DIR" \
    --commitment "$ARTIFACTS_DIR/commitment.json" \
    --claim "$ARTIFACTS_DIR/claim.json" \
    --profile verification.profiles.json || true

# Step 6: Resample failed links
echo -e "${YELLOW}Resampling failed links...${NC}"
adapters/links/bin/adapter-links links:resample \
    --task-dir "$ARTIFACTS_DIR" \
    --commitment "$ARTIFACTS_DIR/commitment.json" \
    --claim "$ARTIFACTS_DIR/claim.json" \
    --profile verification.profiles.json || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Part 2: API Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# API Test
API_TASK_ID="T_api_1"
API_ARTIFACTS_DIR=".artifacts/$API_TASK_ID"

echo -e "${YELLOW}Setting up API test...${NC}"
mkdir -p "$API_ARTIFACTS_DIR/api"

# Create API commitment
cat > "$API_ARTIFACTS_DIR/commitment.json" << EOF
{
  "task_id": "$API_TASK_ID",
  "type": "api_check",
  "profile": "api_basic",
  "commitments": {
    "expected_total": 3,
    "scope": {
      "endpoints": [
        {"url": "https://httpstat.us/200", "method": "GET"},
        {"url": "https://httpstat.us/201", "method": "GET"},
        {"url": "https://httpstat.us/404", "method": "GET"}
      ]
    }
  }
}
EOF

# Create API claim
cat > "$API_ARTIFACTS_DIR/claim.json" << EOF
{
  "task_id": "$API_TASK_ID",
  "claimed": {
    "type": "api_check",
    "units_total": 3,
    "endpoints": [
      {"url": "https://httpstat.us/200", "method": "GET"},
      {"url": "https://httpstat.us/201", "method": "GET"},
      {"url": "https://httpstat.us/404", "method": "GET"}
    ]
  }
}
EOF

echo -e "${YELLOW}Checking API endpoints...${NC}"
adapters/api/bin/adapter-api api:check \
    --task-dir "$API_ARTIFACTS_DIR" \
    --commitment "$API_ARTIFACTS_DIR/commitment.json" \
    --claim "$API_ARTIFACTS_DIR/claim.json" \
    --profile verification.profiles.json || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Show link results
if [ -f "$ARTIFACTS_DIR/links/check.json" ]; then
    echo -e "${YELLOW}Link Check Results:${NC}"
    PASSED=$(jq -r '.passed' "$ARTIFACTS_DIR/links/check.json")
    FAILED=$(jq -r '.failed' "$ARTIFACTS_DIR/links/check.json")
    TOTAL=$(jq -r '.total_checked' "$ARTIFACTS_DIR/links/check.json")
    echo "  Total: $TOTAL"
    echo "  Passed: $PASSED"
    echo "  Failed: $FAILED"

    if [ -f "$ARTIFACTS_DIR/links/resample.json" ]; then
        RECOVERED=$(jq -r '.recovered' "$ARTIFACTS_DIR/links/resample.json")
        STILL_FAILED=$(jq -r '.still_failed' "$ARTIFACTS_DIR/links/resample.json")
        echo "  Recovered after resample: $RECOVERED"
        echo "  Still failed: $STILL_FAILED"
    fi
fi

# Show API results
if [ -f "$API_ARTIFACTS_DIR/api/check.json" ]; then
    echo ""
    echo -e "${YELLOW}API Check Results:${NC}"
    API_PASSED=$(jq -r '.passed' "$API_ARTIFACTS_DIR/api/check.json")
    API_FAILED=$(jq -r '.failed' "$API_ARTIFACTS_DIR/api/check.json")
    API_TOTAL=$(jq -r '.total_checked' "$API_ARTIFACTS_DIR/api/check.json")
    echo "  Total: $API_TOTAL"
    echo "  Passed: $API_PASSED"
    echo "  Failed: $API_FAILED"
fi

echo ""
echo "==========================================="
echo -e "${GREEN}Phase 3 Test Complete!${NC}"
echo "==========================================="
echo ""
echo "Artifacts stored in:"
echo "  Links: $ARTIFACTS_DIR/"
echo "  APIs: $API_ARTIFACTS_DIR/"
echo ""
echo "View detailed results:"
echo "  cat $ARTIFACTS_DIR/links/statuses.json"
echo "  cat $ARTIFACTS_DIR/links/resample.json"
echo "  cat $API_ARTIFACTS_DIR/api/check.json"
echo ""
echo "To test with real URLs:"
echo "  1. Provide a real URL to discover links from"
echo "  2. Run: adapters/links/bin/adapter-links links:discover --url https://example.com"
echo "  3. Then run check and resample commands"