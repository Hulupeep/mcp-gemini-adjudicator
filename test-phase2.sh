#!/bin/bash

# Phase 2 Test Script - Code Verification
set -e

echo "==========================================="
echo "Phase 2 Test: Code Verification"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Setup
TASK_ID="T_code_1"
ARTIFACTS_DIR=".artifacts/$TASK_ID"
VERIFICATION_DIR=".claude/verification"

# Clean up previous test
echo -e "${YELLOW}Cleaning up previous test...${NC}"
rm -rf "$ARTIFACTS_DIR"
rm -f "$VERIFICATION_DIR"/*.json
mkdir -p "$ARTIFACTS_DIR"
mkdir -p "$VERIFICATION_DIR"

echo -e "${GREEN}✓ Setup complete${NC}"
echo ""

# Step 1: Create test commitment
echo -e "${YELLOW}Step 1: Creating test commitment...${NC}"
cat > "$VERIFICATION_DIR/commitment.json" << EOF
{
  "task_id": "$TASK_ID",
  "type": "code",
  "profile": "code_update",
  "user_instruction": "Add logging to 3 functions and fix lint errors",
  "commitments": {
    "expected_total": 3,
    "quality": {
      "lint_clean": true,
      "tests_pass": true,
      "coverage_min": 80
    },
    "scope": {
      "target_directory": "src",
      "files": ["src/test-example.js"],
      "functions": ["getData", "processData", "saveData"]
    }
  },
  "timestamp": "$(date -Iseconds)"
}
EOF

cp "$VERIFICATION_DIR/commitment.json" "$ARTIFACTS_DIR/commitment.json"
echo -e "${GREEN}✓ Commitment created${NC}"

# Step 2: Create test claim
echo -e "${YELLOW}Step 2: Creating test claim...${NC}"
cat > "$VERIFICATION_DIR/claim.json" << EOF
{
  "task_id": "$TASK_ID",
  "claimed": {
    "type": "code",
    "units_total": 3,
    "units_list": ["getData", "processData", "saveData"],
    "files_modified": ["src/test-example.js"],
    "functions_touched": ["getData", "processData", "saveData"],
    "lint_fixed": true,
    "tests_updated": false,
    "notes": "Added console.log statements to 3 functions and fixed lint errors"
  }
}
EOF

cp "$VERIFICATION_DIR/claim.json" "$ARTIFACTS_DIR/claim.json"
echo -e "${GREEN}✓ Claim created${NC}"

# Step 3: Create a test file for verification
echo -e "${YELLOW}Step 3: Creating test code file...${NC}"
mkdir -p src
cat > src/test-example.js << 'EOF'
// Test file for Phase 2 verification

function getData() {
    console.log('Getting data...');  // Added logging
    const data = [1, 2, 3, 4, 5];
    return data;
}

function processData(data) {
    console.log('Processing data...');  // Added logging
    return data.map(x => x * 2);
}

function saveData(data) {
    console.log('Saving data...');  // Added logging
    // Simulate save
    return true;
}

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = { getData, processData, saveData };
}
EOF

echo -e "${GREEN}✓ Test file created${NC}"

# Step 4: Run code adapters
echo -e "${YELLOW}Step 4: Running code verification adapters...${NC}"
echo ""

# Run diff adapter
echo "  Running diff analysis..."
adapters/code/bin/adapter-code code:diff \
    --task-dir "$ARTIFACTS_DIR" \
    --commitment "$ARTIFACTS_DIR/commitment.json" \
    --claim "$ARTIFACTS_DIR/claim.json" \
    --profile verification.profiles.json || true

# Run lint adapter
echo "  Running lint check..."
adapters/code/bin/adapter-code code:lint \
    --task-dir "$ARTIFACTS_DIR" \
    --commitment "$ARTIFACTS_DIR/commitment.json" \
    --claim "$ARTIFACTS_DIR/claim.json" \
    --profile verification.profiles.json || true

# Run tests adapter
echo "  Running tests..."
adapters/code/bin/adapter-code code:tests \
    --task-dir "$ARTIFACTS_DIR" \
    --commitment "$ARTIFACTS_DIR/commitment.json" \
    --claim "$ARTIFACTS_DIR/claim.json" \
    --profile verification.profiles.json || true

# Run coverage adapter
echo "  Running coverage..."
adapters/code/bin/adapter-code code:coverage \
    --task-dir "$ARTIFACTS_DIR" \
    --commitment "$ARTIFACTS_DIR/commitment.json" \
    --claim "$ARTIFACTS_DIR/claim.json" \
    --profile verification.profiles.json || true

echo -e "${GREEN}✓ Adapters complete${NC}"

# Step 5: Build artifacts index
echo -e "${YELLOW}Step 5: Building artifacts index...${NC}"
node tools/build-artifacts-index.mjs "$ARTIFACTS_DIR" > "$ARTIFACTS_DIR/artifacts.json"

# Generate checksums
find "$ARTIFACTS_DIR" -type f ! -name checksums.sha256 -print0 | \
    xargs -0 sha256sum > "$ARTIFACTS_DIR/checksums.sha256"

echo -e "${GREEN}✓ Artifacts indexed${NC}"

# Step 6: Create verdict
echo -e "${YELLOW}Step 6: Creating verification verdict...${NC}"
node -e "
import { promises as fs } from 'fs';

async function createVerdict() {
    const artifacts = JSON.parse(await fs.readFile('$ARTIFACTS_DIR/artifacts.json', 'utf8'));
    const commitment = JSON.parse(await fs.readFile('$ARTIFACTS_DIR/commitment.json', 'utf8'));
    const claim = JSON.parse(await fs.readFile('$ARTIFACTS_DIR/claim.json', 'utf8'));

    // Load results
    let diffResult, lintResult, testResult, coverageResult;
    try { diffResult = JSON.parse(await fs.readFile('$ARTIFACTS_DIR/diff.json', 'utf8')); } catch {}
    try { lintResult = JSON.parse(await fs.readFile('$ARTIFACTS_DIR/lint.json', 'utf8')); } catch {}
    try { testResult = JSON.parse(await fs.readFile('$ARTIFACTS_DIR/tests.json', 'utf8')); } catch {}
    try { coverageResult = JSON.parse(await fs.readFile('$ARTIFACTS_DIR/coverage.json', 'utf8')); } catch {}

    const verdict = {
        task_id: '$TASK_ID',
        status: 'pending',
        units_expected: commitment.commitments.expected_total,
        units_verified: diffResult?.total_changes || 0,
        profile: 'code_update',
        artifacts: artifacts,
        code_verification: {
            diff: diffResult,
            lint: lintResult,
            tests: testResult,
            coverage: coverageResult
        },
        timestamp: new Date().toISOString()
    };

    await fs.writeFile('$ARTIFACTS_DIR/verdict.json', JSON.stringify(verdict, null, 2));

    console.log('');
    console.log('Code Verification Results:');
    console.log('─'.repeat(40));
    console.log('Files changed:', diffResult?.total_changes || 0);
    console.log('Functions modified:', diffResult?.functions_modified?.length || 0);
    console.log('Lint status:', lintResult ? (lintResult.exitCode === 0 ? '✓ PASS' : '✗ FAIL') : 'N/A');
    if (lintResult && lintResult.errors > 0) {
        console.log('  Errors:', lintResult.errors);
        console.log('  Warnings:', lintResult.warnings);
    }
    console.log('Tests:', testResult ? \`\${testResult.passed}/\${testResult.total} passed\` : 'No tests found');
    console.log('Coverage:', coverageResult ? \`\${(coverageResult.pct * 100).toFixed(1)}%\` : 'N/A');
}

createVerdict().catch(console.error);
" 2>&1

echo -e "${GREEN}✓ Verdict created${NC}"

# Step 7: Enforce gate
echo -e "${YELLOW}Step 7: Enforcing verification gate...${NC}"
echo ""

node tools/enforce-gate.mjs "$ARTIFACTS_DIR/verdict.json" verification.profiles.json
GATE_EXIT=$?

echo ""
echo "==========================================="

if [ $GATE_EXIT -eq 0 ]; then
    echo -e "${GREEN}Phase 2 Test PASSED!${NC}"
    echo "Code verification is working correctly."
else
    echo -e "${YELLOW}Phase 2 Test completed with gate failure${NC}"
    echo "This is expected if no test framework or linter is configured."
fi

echo "==========================================="
echo ""
echo "Artifacts stored in: $ARTIFACTS_DIR/"
echo "View results:"
echo "  cat $ARTIFACTS_DIR/diff.json"
echo "  cat $ARTIFACTS_DIR/lint.json"
echo "  cat $ARTIFACTS_DIR/tests.json"
echo "  cat $ARTIFACTS_DIR/coverage.json"
echo "  cat $ARTIFACTS_DIR/verdict.json"
echo ""
echo "To test with real code changes:"
echo "  1. Make actual code changes to a file"
echo "  2. Run: git add <file>"
echo "  3. Claude should output CLAIM JSON for code tasks"
echo "  4. The enhanced post-hook will run all code verifications"