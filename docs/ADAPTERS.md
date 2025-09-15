# Adapters: capabilities, routing, and artifacts

Adapters are **deterministic plugins**. They report facts; the **gate** enforces pass/fail.

## Capability naming

Use `domain:action`:

* `code:diff`, `code:lint`, `code:tests`, `code:coverage`, `code:build`
* `links:discover`, `links:check`, `links:resample`
* `api:endpoints`, `api:responses`, `api:auth`, `api:rate-limits`
* `content:scan`, `content:wordcount`, `content:headings`, `content:images`, `content:quotes`

## Manifest schema (example)

```json
{
  "name": "code-adapter",
  "version": "1.0.0",
  "description": "Code verification adapter for diff, lint, tests, and coverage",
  "entry": "bin/adapter-code",
  "capabilities": [
    "code:diff",
    "code:lint",
    "code:tests",
    "code:coverage",
    "code:build"
  ],
  "sandbox": {
    "tools": ["git", "npm", "node", "eslint", "jest"],
    "timeout": 60,
    "network": false
  }
}
```

## Routing: `config/adapter-plan.json`

```json
{
  "code_update": {
    "order": ["code:diff", "code:lint", "code:tests", "code:coverage", "code:build"],
    "required": ["code:diff", "code:lint"],
    "optional": ["code:tests", "code:coverage", "code:build"]
  },
  "link_check": {
    "order": ["links:discover", "links:check", "links:resample"],
    "required": ["links:discover", "links:check"],
    "optional": ["links:resample"]
  },
  "content": {
    "order": ["content:scan", "content:wordcount", "content:headings", "content:images"],
    "required": ["content:scan"],
    "optional": ["content:wordcount", "content:headings", "content:images"]
  },
  "api_test": {
    "order": ["api:endpoints", "api:responses", "api:auth", "api:rate-limits"],
    "required": ["api:endpoints", "api:responses"],
    "optional": ["api:auth", "api:rate-limits"]
  }
}
```

The post-hook reads the plan and executes capabilities in order, resolving each to a **binary** via adapter manifests.

## CLI contract

```bash
adapter-<name> <capability> \
  --task-dir .artifacts/<task_id> \
  --commitment .artifacts/<task_id>/commitment.json \
  --claim .artifacts/<task_id>/claim.json \
  --profile config/verification.profiles.json
```

* **Write artifacts** into `--task-dir` (create subfolders as needed: `links/`, `api/`, `quality/` …).
* **Exit 0** on success (facts written), non-zero only on crash. Gate and verifier handle failures.

## Expected artifacts (by domain)

### Code

* `diff.json` → `{ "files_modified": [], "files_created": [], "files_deleted": [], "total_changes": N }`
* `diff_names.json` → `{ "added": [], "modified": [], "deleted": [] }`
* `diffs.patch` → Git patch format
* `lint.json` → `{ "errors": N, "warnings": M, "files_checked": K, "issues": [] }`
* `tests.json` → `{ "passed": N, "failed": M, "total": K, "skipped": L, "duration": ms }`
* `coverage.json` → `{ "pct": 0.93, "lines": {...}, "functions": {...}, "branches": {...} }`
* `build.json` → `{ "success": true/false, "errors": [], "warnings": [] }`

### Links

* `links/urlset.json` → Full discovered URL list
* `links/statuses.json` → `{ "url": http_status_or_error }`
* `links/resample.json` → Retry transcript for failures

### API

* `api/endpoints.json` → `{ "discovered": [], "documented": [], "undocumented": [] }`
* `api/responses.json` → `{ "endpoint": { "status": N, "latency_ms": M, "body_sample": "..." } }`
* `api/schema.json` → `{ "ok": true, "errors": [], "schema_hash": "..." }`
* `api/auth.json` → `{ "methods": [], "endpoints_protected": [], "endpoints_public": [] }`

### Content

* `content/scan.json` → `{ "files": [{ "path": "...", "word_count": N, "char_count": M }] }`
* `content/headings.json` → `{ "file": { "h1": [], "h2": [], "h3": [] } }`
* `content/images.json` → `{ "file": [{ "src": "...", "alt": "...", "width": N, "height": M }] }`
* `content/quotes.json` → `{ "file": [{ "text": "...", "source": "..." }] }`

## Gate expectations

* **Code:**
  - Lint/tests required? Enforce
  - Coverage ≥ threshold
  - Build must succeed if required
  - Function/endpoint count aligns with commitment

* **Links:**
  - `len(statuses) == len(urlset)` for full coverage
  - Apply `treat_3xx_as_pass` policy
  - Resample count ≤ threshold
  - Timeout enforcement

* **API:**
  - Schema must pass validation
  - Required endpoints must exist
  - Auth coverage if security profile active
  - Latency thresholds (p50, p95, p99)

* **Content:**
  - Word count ≥ minimum
  - Required headings present (h1, etc.)
  - Image count ≥ minimum if specified
  - Proper quote attribution

## LLM-zero fast path

If artifacts conclusively PASS/FAIL under the active profile: write `verdict.json` directly (no Gemini). Otherwise call verifier.

```javascript
// Example fast path logic in enforce-gate.mjs
if (profile.lint_clean && lintArtifact.errors > 0) {
    verdict.status = 'fail';
    verdict.reasons.push(`Lint errors: ${lintArtifact.errors}`);
    // No LLM needed - deterministic fail
}
```

## Writing a new adapter

### 1. Create manifest

```json
{
  "name": "my-adapter",
  "version": "1.0.0",
  "description": "Does something deterministic",
  "entry": "bin/adapter-my",
  "capabilities": ["my:check", "my:validate"],
  "sandbox": {
    "tools": ["node"],
    "timeout": 30,
    "network": false
  }
}
```

### 2. Implement CLI

```javascript
#!/usr/bin/env node
// bin/adapter-my

import { runCheck } from '../src/check.mjs';
import { runValidate } from '../src/validate.mjs';

const command = process.argv[2];
const options = parseArgs(process.argv.slice(3));

switch (command) {
    case 'my:check':
        await runCheck(options);
        console.log(`✓ Check complete: ${options.taskDir}/check.json`);
        break;
    case 'my:validate':
        await runValidate(options);
        console.log(`✓ Validation complete: ${options.taskDir}/validate.json`);
        break;
    default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
}
```

### 3. Write deterministic artifacts

```javascript
// src/check.mjs
export async function runCheck(options) {
    const results = {
        checked: [],
        errors: [],
        warnings: [],
        timestamp: new Date().toISOString() // OK in metadata
    };

    // Do deterministic checks...
    // Sort before writing for stability
    results.checked.sort();

    await fs.writeFile(
        path.join(options.taskDir, 'check.json'),
        JSON.stringify(results, null, 2)
    );
}
```

### 4. Add to adapter-plan.json

```json
{
  "my_task_type": {
    "order": ["my:check", "my:validate"],
    "required": ["my:check"],
    "optional": ["my:validate"]
  }
}
```

## Determinism checklist

✅ **DO:**
- Sort arrays before writing JSON
- Use stable IDs/keys
- Report counts and facts
- Exit 0 on success (even if checks found issues)
- Write to stderr for debugging

❌ **DON'T:**
- Include random values or unstable ordering
- Embed timestamps in artifact content (metadata OK)
- Make network calls without declaring in manifest
- Decide pass/fail (that's the gate's job)
- Include LLM output as "facts"

## Testing adapters

```bash
# Unit test with fixtures
export TASK_ID=T_test
mkdir -p .artifacts/$TASK_ID
echo '{"task_id":"T_test","type":"code"}' > .artifacts/$TASK_ID/commitment.json
echo '{"task_id":"T_test","claim":{"type":"code"}}' > .artifacts/$TASK_ID/claim.json

# Run adapter
adapters/code/bin/adapter-code code:diff --task-dir .artifacts/$TASK_ID

# Verify output is deterministic
cat .artifacts/$TASK_ID/diff.json
# Run again and diff - should be identical
```

## Adapter discovery

The system discovers adapters at runtime:

1. Scan `adapters/*/manifest.json`
2. Build capability index: `{ "code:diff": "adapters/code/bin/adapter-code", ... }`
3. When task type needs capability, resolve via index
4. Execute with standard CLI contract

This allows:
- Multiple adapters providing same capability (first wins)
- Third-party adapters in any language
- Hot-swapping adapters without core changes
- Community contributions without forking