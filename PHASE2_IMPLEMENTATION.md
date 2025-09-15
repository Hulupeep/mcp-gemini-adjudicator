# Phase 2 Implementation - Code Verification

## ✅ Phase 2 Complete - Code Quality Gates

Phase 2 adds **deterministic code verification** to the MCP Gemini Adjudicator:
- Diff analysis (what changed)
- Lint checking (code quality)
- Test execution (functionality)
- Coverage metrics (test completeness)
- Enforcement gates (pass/fail criteria)

## 🎯 What Phase 2 Does

Per PRD v2, Phase 2 implements:
- **Code adapters** that measure without deciding (just collect metrics)
- **Artifacts bundling** with checksums for reproducibility
- **Gate enforcement** that fails when thresholds aren't met
- **Profile-based requirements** (code_update, code_critical, code_prototype)

## 📁 New Components Added

```
mcp-gemini-adjudicator/
├── adapters/
│   └── code/
│       ├── manifest.json              # Adapter configuration
│       ├── bin/
│       │   └── adapter-code          # CLI dispatcher
│       └── src/
│           ├── diff.mjs              # Git diff analysis
│           ├── lint.mjs              # Linting checks
│           ├── tests.mjs             # Test execution
│           └── coverage.mjs          # Coverage metrics
├── tools/
│   ├── build-artifacts-index.mjs     # Create artifacts bundle
│   └── enforce-gate.mjs              # Apply profile thresholds
├── .artifacts/                       # Task verification data
│   └── [TASK_ID]/
│       ├── diff.json                 # Diff results
│       ├── lint.json                 # Lint results
│       ├── tests.json                # Test results
│       ├── coverage.json             # Coverage results
│       ├── artifacts.json            # Bundled index
│       ├── checksums.sha256          # File checksums
│       └── verdict.json              # Final verdict
└── .claude/hooks/
    └── post-task-verification-enhanced.sh  # Phase 2 hook
```

## 🚀 How to Use Phase 2

### 1. Manual Code Verification

```bash
# Set up a task
export TASK_ID=T_code_1
mkdir -p .artifacts/$TASK_ID

# Create commitment
cat > .artifacts/$TASK_ID/commitment.json << EOF
{
  "task_id": "$TASK_ID",
  "type": "code",
  "profile": "code_update",
  "commitments": {
    "expected_total": 3,
    "quality": {
      "lint_clean": true,
      "tests_pass": true,
      "coverage_min": 80
    }
  }
}
EOF

# Run individual adapters
adapters/code/bin/adapter-code code:diff --task-dir .artifacts/$TASK_ID
adapters/code/bin/adapter-code code:lint --task-dir .artifacts/$TASK_ID
adapters/code/bin/adapter-code code:tests --task-dir .artifacts/$TASK_ID
adapters/code/bin/adapter-code code:coverage --task-dir .artifacts/$TASK_ID

# Or run all at once
adapters/code/bin/adapter-code code:all --task-dir .artifacts/$TASK_ID

# Build artifacts and enforce gate
node tools/build-artifacts-index.mjs .artifacts/$TASK_ID > .artifacts/$TASK_ID/artifacts.json
node tools/enforce-gate.mjs .artifacts/$TASK_ID/verdict.json verification.profiles.json
```

### 2. Automatic Verification with Claude

When Claude performs code tasks:

1. **Pre-hook** extracts commitment (expected changes)
2. **Claude** does the work and outputs CLAIM JSON
3. **Post-hook** automatically:
   - Runs all code adapters
   - Builds artifacts bundle
   - Creates verdict
   - Enforces gate (pass/fail)

### 3. Configure Profiles

Edit `verification.profiles.json`:

```json
{
  "code_update": {
    "lint_required": true,
    "tests_required": true,
    "coverage_min": 80,
    "description": "Standard code updates"
  },
  "code_critical": {
    "lint_required": true,
    "tests_required": true,
    "coverage_min": 90,
    "build_required": true,
    "description": "Critical production code"
  },
  "code_prototype": {
    "lint_required": false,
    "tests_required": false,
    "coverage_min": 0,
    "description": "Experimental code"
  }
}
```

## 🔍 What Gets Verified

### Diff Analysis (`diff.mjs`)
- ✅ Files modified/created/deleted
- ✅ Functions added/modified
- ✅ Endpoints added (REST API routes)
- ✅ Total change count vs commitment

### Lint Checking (`lint.mjs`)
- ✅ ESLint for JavaScript/TypeScript
- ✅ Pylint/Ruff for Python
- ✅ RuboCop for Ruby
- ✅ golangci-lint for Go
- ✅ npm run lint fallback

### Test Execution (`tests.mjs`)
- ✅ Jest, Mocha for JavaScript
- ✅ pytest for Python
- ✅ go test for Go
- ✅ cargo test for Rust
- ✅ npm test fallback

### Coverage Analysis (`coverage.mjs`)
- ✅ Jest --coverage
- ✅ nyc for Node.js
- ✅ coverage.py for Python
- ✅ go test -cover
- ✅ Normalizes to percentage

## 📊 Gate Enforcement Rules

The gate **FAILS** when:
- ❌ **DIFF_MISMATCH**: Fewer changes than committed
- ❌ **LINT_FAILED**: Lint returns non-zero exit code
- ❌ **TESTS_FAILED**: Any tests fail
- ❌ **TESTS_EMPTY**: No tests found (if required)
- ❌ **COVERAGE_LOW**: Coverage below profile minimum
- ❌ **FUNCTION_MISMATCH**: Claimed 5 functions, verified 3
- ❌ **ENDPOINT_MISMATCH**: Claimed 4 endpoints, verified 2

## 🧪 Test Phase 2

```bash
# Run the automated test
./test-phase2.sh

# Expected output:
# - Diff: Detects file changes
# - Lint: Fails if no ESLint config
# - Tests: Reports no tests found
# - Coverage: Shows 0% coverage
# - Gate: FAILS due to unmet requirements
```

## 📈 Example Workflow

### User Request:
"Add error handling to all API endpoints and ensure 90% test coverage"

### System Flow:
```
1. Pre-hook extracts:
   - type: "code"
   - profile: "code_critical"
   - expected: API endpoint modifications
   - coverage_min: 90

2. Claude modifies code and outputs:
   {
     "claimed": {
       "type": "code",
       "units_total": 5,
       "functions_touched": ["handleGet", "handlePost", ...],
       "tests_updated": true
     }
   }

3. Code adapters run:
   - Diff: 5 functions modified ✓
   - Lint: 0 errors ✓
   - Tests: 48/50 passed ✗
   - Coverage: 92% ✓

4. Gate enforcement:
   - TESTS_FAILED: 2 tests failed
   - Exit code: 1 (FAIL)

5. Claude must fix the failing tests
```

## ⚠️ Important Notes

1. **Adapters only measure** - They don't decide pass/fail
2. **Gate enforces thresholds** - Based on profile requirements
3. **Checksums ensure reproducibility** - Same inputs = same outputs
4. **No test framework is OK** - Adapter reports "No tests found"
5. **Profile determines requirements** - Not all projects need 90% coverage

## 🔄 Integration with Phase 1

The enhanced post-hook (`post-task-verification-enhanced.sh`) automatically detects task type:
- **Content tasks** → Phase 1 verification (word counts, file creation)
- **Code tasks** → Phase 2 verification (lint, tests, coverage)

## 🎯 Success Criteria

Phase 2 is successful when:
1. All code adapters run without deciding pass/fail ✅
2. Artifacts bundle includes checksums ✅
3. Gate enforcement respects profile thresholds ✅
4. System fails when requirements aren't met ✅
5. Re-runs are idempotent (stable checksums) ✅

## 📝 Key Commands Reference

| Command | Purpose |
|---------|---------|
| `adapter-code code:diff` | Analyze changes |
| `adapter-code code:lint` | Check code quality |
| `adapter-code code:tests` | Run test suite |
| `adapter-code code:coverage` | Measure coverage |
| `adapter-code code:all` | Run all adapters |
| `build-artifacts-index.mjs` | Create bundle |
| `enforce-gate.mjs` | Apply thresholds |

## Summary

Phase 2 adds **deterministic code verification** with:
- Automated quality checks (lint, tests, coverage)
- Profile-based requirements
- Reproducible artifacts with checksums
- Clear pass/fail gate enforcement

This ensures code changes meet quality standards before acceptance!