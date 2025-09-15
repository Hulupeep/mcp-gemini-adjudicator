# MCP Gemini Adjudicator - Complete System Documentation

## 🚀 Overview

A deterministic verification system that validates AI-generated code changes, API responses, and content modifications through a multi-stage pipeline with configurable adapters, gate enforcement, and persistent evidence tracking.

## ✨ Key Features Implemented

### 1. **Per-Unit Persistence & Dashboard** ✅
- SQLite storage for individual verification results
- Enhanced monitoring dashboard with granular unit tracking
- Metrics persistence for performance analysis
- Real-time API endpoints for unit queries

### 2. **Comprehensive Adapter System** ✅
- **Code Adapter**: Diff analysis, lint, tests, coverage, function mapping
- **API Adapter**: Schema validation with JSONSchema, latency measurements
- **Content Adapter**: Word count, reading level analysis
- **Links Adapter**: URL discovery and status checking
- **Template Package**: Complete starter kit for new adapters

### 3. **CI/CD Integration** ✅
- GitHub Actions workflows for PR verification
- Scheduled health monitoring
- Artifact validation with checksums
- JUnit test reporting
- Automatic PR comments with results

### 4. **Function Mapping with Confidence** ✅
- Extracts functions/endpoints from code diffs
- Matches claimed vs actual implementations
- Confidence levels (certain/fuzzy)
- DIFF_MISMATCH detection for missing functions

### 5. **API Schema Validation** ✅
- JSONSchema validation with AJV
- Persisted evidence with schema ID/hash
- Latency budget enforcement
- Format validation (email, URI, etc.)

## 📁 Project Structure

```
mcp-gemini-adjudicator/
├── adapters/                 # Verification adapters
│   ├── api/                 # API schema validation
│   ├── code/                # Code verification (lint, test, coverage)
│   ├── content/             # Content analysis
│   ├── links/               # Link checking
│   └── template/            # Template for new adapters
├── .github/workflows/       # GitHub Actions CI/CD
│   ├── verify-pr.yml       # PR verification
│   ├── scheduled-verification.yml
│   └── manual-verify.yml
├── config/                  # Configuration files
│   ├── profiles.json       # Verification profiles
│   ├── adapter-plan.json  # Task type to adapter mapping
│   └── verification.profiles.json
├── monitoring/              # Dashboard and API server
│   ├── enhanced-server.mjs
│   └── public/
│       └── enhanced-dashboard.html
├── schemas/                 # JSON schemas for validation
│   ├── artifacts.index.schema.json
│   ├── verify.claim.v1_1.schema.json
│   └── verdict.schema.json
├── src/                     # Core source code
│   ├── migrations/         # Database migrations
│   │   ├── 001_init.sql
│   │   └── 002_units.sql
│   └── storage-sqlite.mjs # Database operations
├── tools/                   # Utility scripts
│   ├── enforce-gate.mjs   # Gate enforcement logic
│   ├── persist-verdict-to-sqlite.mjs
│   ├── ci-validate-artifacts.mjs
│   ├── build-artifacts-index.mjs
│   ├── resolve-adapter.js
│   └── system-check.mjs
├── .artifacts/             # Verification artifacts (gitignored)
└── verify.sqlite          # SQLite database

```

## 🚦 Quick Start

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-gemini-adjudicator.git
cd mcp-gemini-adjudicator

# Install dependencies
npm install

# Install adapter dependencies
for adapter in adapters/*/; do
  if [ -f "$adapter/package.json" ]; then
    cd "$adapter" && npm install && cd ../..
  fi
done

# Initialize database
for migration in src/migrations/*.sql; do
  sqlite3 verify.sqlite < "$migration"
done

# Run system check
node tools/system-check.mjs
```

### 2. Run a Code Verification

```bash
# Set up test task
export TASK_ID=test_code
mkdir -p .artifacts/$TASK_ID

# Create commitment
cat > .artifacts/$TASK_ID/commitment.json << EOF
{
  "task_id": "$TASK_ID",
  "type": "code_update",
  "requirements": {
    "functions": ["authenticate", "validateToken"],
    "lint_clean": true,
    "tests_pass": true
  }
}
EOF

# Create claim
cat > .artifacts/$TASK_ID/claim.json << EOF
{
  "task_id": "$TASK_ID",
  "claim": {
    "type": "code_update",
    "units_list": ["func:authenticate", "func:validateToken"]
  }
}
EOF

# Run adapters
node adapters/code/bin/adapter-code code:diff --task-dir .artifacts/$TASK_ID
node adapters/code/bin/adapter-code code:lint --task-dir .artifacts/$TASK_ID
node adapters/code/bin/adapter-code code:tests --task-dir .artifacts/$TASK_ID
node adapters/code/bin/adapter-code code:map-functions --task-dir .artifacts/$TASK_ID

# Build artifacts index
node tools/build-artifacts-index.mjs .artifacts/$TASK_ID > .artifacts/$TASK_ID/artifacts.json

# Enforce gate
node tools/enforce-gate.mjs .artifacts/$TASK_ID/artifacts.json config/profiles.json

# Persist results
node tools/persist-verdict-to-sqlite.mjs .artifacts/$TASK_ID
```

### 3. Run API Verification

```bash
export TASK_ID=test_api
mkdir -p .artifacts/$TASK_ID

# Check API against schema
node adapters/api/bin/adapter-api api:check \
  --task-dir .artifacts/$TASK_ID \
  --url https://api.github.com/user \
  --schema schemas/github-user.schema.json

# Measure latency
node adapters/api/bin/adapter-api api:latency \
  --task-dir .artifacts/$TASK_ID \
  --url https://api.github.com/user
```

### 4. Start Monitoring Dashboard

```bash
# Start the monitoring server
cd monitoring
VERIFY_DB_PATH=../verify.sqlite node enhanced-server.mjs

# Open browser to http://localhost:4000
```

## 🔧 Configuration

### Verification Profiles (`config/profiles.json`)

```json
{
  "code_update_default": {
    "lint_clean": true,
    "tests_pass": true,
    "coverage_min": 70,
    "function_certainty_required": "certain"
  },
  "api_scrape": {
    "schema_required": true,
    "latency_budget_ms": 500
  }
}
```

### Adapter Mapping (`config/adapter-plan.json`)

```json
{
  "code": ["code:diff", "code:lint", "code:tests"],
  "api_test": ["api:check", "api:latency"],
  "link_check": ["links:discover", "links:check"]
}
```

## 🧪 Testing

### End-to-End Tests

```bash
# Run system check
node tools/system-check.mjs

# Test database
sqlite3 verify.sqlite "SELECT * FROM units LIMIT 5;"

# Test adapter resolution
node tools/resolve-adapter.js code:diff

# Test CI validation
node tools/ci-validate-artifacts.mjs .artifacts/test_task

# Run complete E2E test suite
bash testend.md
```

### GitHub Actions Testing

```bash
# Create a test PR to trigger verification
git checkout -b test-pr
echo "test" > test.txt
git add test.txt
git commit -m "Test PR verification"
git push origin test-pr
# Create PR on GitHub - workflow will run automatically

# Manually trigger scheduled verification
# Go to Actions tab → scheduled-verification → Run workflow
```

## 📊 API Endpoints

The monitoring server provides these endpoints:

- `GET /api/tasks` - List all verification tasks
- `GET /api/tasks/:taskId` - Get specific task details
- `GET /api/tasks/:taskId/units` - Get per-unit results
- `GET /api/stats/units/types` - Unit type distribution
- `GET /api/stats/daily` - Daily verification statistics

## 🎯 Gate Enforcement

The system enforces these verification gates:

1. **MISSING_CLAIM** - No claim.json found
2. **DIFF_MISMATCH** - Claimed functions not in actual changes
3. **LINT_FAIL** - Linting errors detected
4. **TEST_FAIL** - Test failures
5. **COVERAGE_FAIL** - Below minimum coverage
6. **SCHEMA_MISMATCH** - API response doesn't match schema
7. **LINK_FAIL** - Broken links detected

## 🔒 Security Features

- Checksum verification for all artifacts
- Schema validation for JSON files
- Sandboxed adapter execution
- No hardcoded secrets (use environment variables)
- Deterministic verification without LLM dependency

## 📈 Performance

- Parallel adapter execution
- SQLite for fast local queries
- Cached adapter resolution
- Efficient diff analysis
- Configurable timeouts

## 🛠️ Creating New Adapters

Use the template package:

```bash
# Copy template
cp -r adapters/template adapters/my-adapter

# Update manifest.json
edit adapters/my-adapter/manifest.json

# Implement capabilities
edit adapters/my-adapter/src/verify.mjs

# Test adapter
node adapters/my-adapter/bin/adapter-my-adapter verify \
  --task-dir .artifacts/test
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests
5. Run verification: `node tools/system-check.mjs`
6. Submit a pull request

## 🐛 Troubleshooting

### Common Issues

**Adapter not found:**
```bash
node tools/resolve-adapter.js code:diff
# Check adapter manifest exists
```

**Database errors:**
```bash
# Recreate database
rm verify.sqlite
for migration in src/migrations/*.sql; do
  sqlite3 verify.sqlite < "$migration"
done
```

**CI validation failing:**
```bash
# Check artifacts structure
node tools/ci-validate-artifacts.mjs .artifacts/TASK_ID
# Review error messages for missing files or invalid JSON
```

**Gate always failing:**
```bash
# Check profiles
cat config/profiles.json
# Review verdict for specific reasons
jq '.reasons' .artifacts/TASK_ID/verdict.json
```

## 📚 Additional Documentation

- [GitHub Actions Setup](GITHUB_ACTIONS_SETUP.md)
- [Adapter Development Guide](packages/adapter-template/README.md)
- [End-to-End Testing](testend.md)
- [API Documentation](monitoring/API.md)

## 🎉 Features Completed

✅ **ASK A**: Per-unit persistence with SQLite and dashboard
✅ **SK B**: Adapter documentation and template package
✅ **ASK C**: CI artifact validation with schemas and checksums
✅ **ASK D**: Function mapping with confidence levels
✅ **ASK E**: API schema validation with evidence

## 📞 Support

- Create issues for bugs or feature requests
- Check existing adapters for implementation examples
- Review test cases in `.artifacts/` for working examples
- Consult workflow logs in GitHub Actions for CI issues

---

**The MCP Gemini Adjudicator is now fully operational with comprehensive verification capabilities!**