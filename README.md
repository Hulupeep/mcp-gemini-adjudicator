# AI Fact-Gate: Truth Gate for AI Work

> **Models can do the work. They don't get to grade it.**

[![Verify Claims](https://github.com/Hulupeep/ai-fact-gate/actions/workflows/verify-pr.yml/badge.svg)](https://github.com/Hulupeep/ai-fact-gate/actions/workflows/verify-pr.yml)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem

LLMs say "done" even when they skipped steps—tests not run, links not checked, files missing. Manual checking kills your velocity (and trust).

## The Fix

We flip the trust model: **truth = stateful artifacts, not model text**.

1. **Executor** (any LLM) does the task and outputs a Claim JSON (just what it says it touched).
2. **Adapters** (tiny deterministic tools) measure reality—git diffs, test & coverage reports, link status maps, API schema checks, etc.
3. **A Gate** reads those artifacts and decides pass/fail.
4. **(Optional) Gemini** reads the artifacts to explain the result. It never runs checks or guesses numbers.

**Rule: no artifacts, no pass.**

## What You Get

- **PR Merge Gate**: red/green checks on every pull request with JUnit details.
- **Artifacts Bundle** per task: diffs, reports, link maps, checksums.
- **Dashboard**: per-unit truth (which functions/links/files passed or failed, and why).
- **SQLite History**: trends and reliability over time.
- **Adapter System**: plug-ins anyone can add (code, links, API, content…).

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Hulupeep/ai-fact-gate.git
cd ai-fact-gate

# Install dependencies
npm install

# Initialize database
for migration in src/migrations/*.sql; do
  sqlite3 verify.sqlite < "$migration"
done

# Run system check
node tools/system-check.mjs

# Start monitoring dashboard
cd monitoring && VERIFY_DB_PATH=../verify.sqlite node enhanced-server.mjs
# Open http://localhost:4000
```

## How It Works

### 1. AI Makes a Claim

When an AI completes a task, it produces a claim:

```json
{
  "task_id": "PR_123",
  "claim": {
    "type": "code_update",
    "units_list": ["func:authenticate", "func:validateToken"],
    "declared": {
      "intent": "Add user authentication",
      "completion_status": "complete"
    }
  }
}
```

### 2. Adapters Measure Reality

Deterministic adapters check the actual state:

```bash
# Code adapter checks diffs, tests, coverage
node adapters/code/bin/adapter-code code:diff --task-dir .artifacts/PR_123
node adapters/code/bin/adapter-code code:tests --task-dir .artifacts/PR_123
node adapters/code/bin/adapter-code code:map-functions --task-dir .artifacts/PR_123

# API adapter validates schemas
node adapters/api/bin/adapter-api api:check --url https://api.example.com --schema user.schema.json
```

### 3. Gate Enforces Truth

The gate reads artifacts and decides:

```javascript
// Gate logic
if (claim.functions !== diff.actualFunctions) {
  return "DIFF_MISMATCH: Claimed func:refreshToken not found in changes"
}
if (tests.failed > 0) {
  return "TEST_FAIL: 3 tests failing"
}
if (coverage.percentage < profile.minimum) {
  return "COVERAGE_FAIL: 65% < 70% required"
}
```

### 4. Results Are Persisted

Every verification creates permanent evidence:

```sql
-- Per-unit tracking
SELECT unit_id, claimed, verified, reason
FROM units WHERE task_id='PR_123';

-- Results
func:authenticate  | 1 | 1 | null
func:validateToken | 1 | 1 | null
func:refreshToken  | 1 | 0 | Not found in diff
```

## Verification Gates

| Gate | Description | Example Failure |
|------|-------------|-----------------|
| `MISSING_CLAIM` | No claim provided | AI didn't produce claim.json |
| `DIFF_MISMATCH` | Claimed != actual changes | Said added 5 functions, found 3 |
| `LINT_FAIL` | Code quality issues | 12 linting errors |
| `TEST_FAIL` | Tests not passing | 3 of 47 tests failed |
| `COVERAGE_FAIL` | Insufficient test coverage | 65% coverage, need 70% |
| `SCHEMA_MISMATCH` | API response invalid | Missing required field 'id' |
| `LINK_FAIL` | Broken links | 4 URLs return 404 |

## Adapters

Current adapters measure:

- **Code**: diffs, lint, tests, coverage, function mapping
- **API**: schema validation, latency
- **Links**: URL discovery, status checking
- **Content**: word count, reading level

Create your own adapter:

```javascript
// adapters/custom/src/verify.mjs
export async function verify(options) {
  const { taskDir, claim } = options;

  // Measure something deterministic
  const reality = await measureReality();

  // Compare to claim
  const results = {
    claimed: claim.units_list,
    verified: reality.actual,
    mismatches: findMismatches(claim, reality)
  };

  // Save artifacts
  await fs.writeFile(`${taskDir}/custom.json`, JSON.stringify(results));

  return results;
}
```

## GitHub Actions Integration

Every PR gets verified automatically:

```yaml
name: PR Verification
on: pull_request

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci

      # AI makes claim about changes
      - run: node tools/generate-claim.js > claim.json

      # Adapters measure reality
      - run: ./adapters/code/bin/adapter-code code:all

      # Gate enforces truth
      - run: node tools/enforce-gate.mjs

      # Comment results on PR
      - uses: actions/github-script@v7
        with:
          script: |
            const verdict = require('./verdict.json');
            const status = verdict.status === 'pass' ? '✅' : '❌';
            github.issues.createComment({
              issue_number: context.issue.number,
              body: `${status} Verification: ${verdict.status}\n${verdict.reasons.join('\n')}`
            });
```

## Monitoring Dashboard

Real-time verification status at `http://localhost:4000`:

- Task list with pass/fail status
- Per-unit verification details
- Failure reason distribution
- Historical trends

## Philosophy

**Trust artifacts, not assertions.**

- LLMs are great at doing work
- Deterministic tools are great at measuring work
- Gates enforce standards without exceptions
- Evidence persists for accountability

**No artifacts = No pass. No exceptions.**

## Project Structure

```
ai-fact-gate/
├── adapters/           # Deterministic measurement tools
├── tools/              # Gate enforcement & utilities
├── monitoring/         # Dashboard & API server
├── .github/workflows/  # CI/CD automation
└── verify.sqlite       # Truth database
```

## Complete Documentation

- [Full Feature List](FEATURES_IMPLEMENTED.md)
- [GitHub Actions Setup](GITHUB_ACTIONS_SETUP.md)
- [Adapter Development Guide](packages/adapter-template/README.md)
- [End-to-End Testing](testend.md)

## License

MIT - Because truth should be open source.

---

**Remember: Models can do the work. They don't get to grade it.**