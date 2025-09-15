# PRD v2 — **Universal Verification Hooks** (LLM-ready, explicit ask)

**Project:** Claude (executor) + Gemini (verifier)
**Owner:** Colm Byrne
**Date:** 2025-09-15
**Repo:** `/home/xanacan/Dropbox/code/testgem/`
**Goal:** Make *any* AI-claimed update **measurable, auditable, and verified** (content + code + system).

---

## 0) The Ask (explicit for LLMs)

### 0.1 Claude (Executor) — SYSTEM PROMPT

You are the **Executor**. For every user task, you MUST:

1. **Parse commitments** (what will be done, how many, where).
2. **Do the work**.
3. **Emit a structured CLAIM JSON** describing exactly what you changed/checked/created.
4. **Emit artifacts** (files/diffs/reports/lists) required for verification.
5. **Never assert success without measurable evidence.**

**Forbidden:** claiming counts you didn’t achieve; vague language (“done”, “should be fine”); omitting CLAIM JSON.

### 0.2 Gemini (Verifier) — SYSTEM PROMPT

You are the **Verifier**. For each task, you MUST:

1. Read **commitment**, **claim**, **artifacts**, **profile** (thresholds).
2. Independently **re-count, re-check, and cross-align**.
3. Return a **VERDICT JSON** with granular per-unit results, metrics, and reasons.
4. Prefer **deterministic checks**; for flaky externals, re-sample.

**Forbidden:** trusting the claim; passing tasks that miss thresholds; ignoring missing units.

---

## 1) Scope (what must be verifiable)

* **Content:** counts, word minima, quoted insertions, format/schema, link checks.
* **Code:** files/functions/endpoints updated, lint/test/coverage, build/typecheck, diffs align with commitments.
* **System:** link status for discovered set, DB rows touched (before/after), API scrape counts + schema.

Out of scope (v2): human subjective quality, deep static analysis, CI integration.

---

## 2) Execution Flow (LLM contract)

```
User Ask → Commitments (pre-hook) → Claude executes → CLAIM JSON + Artifacts
      → Collector normalizes → Gemini verifies → VERDICT JSON → Dashboard/store
```

* **Pre-hook**: extracts commitments and profile (thresholds).
* **Post-hook**: requires CLAIM JSON from Claude; packages artifacts for Gemini.
* **Storage**: SQLite (v2 schema below).
* **Dashboard**: shows Commitment | Claim | Verified (granular).

---

## 3) Data Contracts (copy-pasteable)

### 3.1 Commitment (pre-hook → store)

```json
{
  "task_id": "UUID",
  "type": "content|code|link_check|db_update|api_scrape",
  "profile": "content_default|code_update|link_check|db_update|api_scrape",
  "user_instruction": "string",
  "commitments": {
    "expected_total": 25,
    "quality": { "word_min": 400, "coverage": 1.0 },
    "scope": {
      "files": ["utils.py"],
      "functions": ["createUser","deleteUser"],
      "endpoints": ["/users/create","/users/delete"]
    }
  }
}
```

### 3.2 Claim (Claude MUST output this)

```json
{
  "task_id": "UUID",
  "claimed": {
    "type": "code_update|content|link_check|db_update|api_scrape",
    "units_total": 25,
    "units_list": ["unit_id_or_path_1","unit_id_or_path_2"],
    "files_modified": ["src/handler.ts","src/logger.ts"],
    "functions_touched": ["createUser","deleteUser"],
    "word_min": 400,
    "coverage_claimed": 0.92,
    "notes": "Added logging middleware; updated tests for 5 endpoints"
  }
}
```

### 3.3 Artifacts (Collector)

```json
{
  "task_id": "UUID",
  "artifacts": {
    "content": {
      "files": [{"path":"posts/p1.md","word_count":432}, {"path":"posts/p2.md","word_count":401}]
    },
    "code": {
      "diff_names": ["src/handler.ts","src/logger.ts"],
      "diff_patch": "unified diff text...",
      "lint": {"exit_code":0,"output":""},
      "tests": {"passed":42,"total":42},
      "coverage": {"pct":0.93,"report_path":"coverage/lcov.info"},
      "build": {"exit_code":0,"output":""}
    },
    "links": {
      "discovered": ["https://a","https://b", "..."],
      "statuses": {"https://a":200,"https://b":301},
      "failed_sample_retries": {"https://b":[200,200]}
    },
    "db": {
      "rows_before_hash":"abc123",
      "rows_after_hash":"def456",
      "touched_ids":[1,2,3,4]
    },
    "api": {
      "items_count": 100,
      "schema_ok": true,
      "sample_payloads_validated": 5
    }
  }
}
```

### 3.4 Verdict (Gemini MUST output this)

```json
{
  "task_id": "UUID",
  "status": "pass|fail|partial",
  "units_expected": 25,
  "units_verified": 23,
  "per_unit": [
    {"id":"posts/p1.md","ok":true},
    {"id":"posts/p9.md","ok":false,"reason":"word_count<400"}
  ],
  "reasons": ["Missing logging in deleteUser","2 links not checked"],
  "metrics": {
    "coverage": 0.93,
    "lint_errors": 0,
    "tests_passed": 42,
    "tests_total": 42
  },
  "policy": {
    "profile": "code_update",
    "thresholds": {"coverage_min":0.90,"treat_3xx_as_pass":true}
  }
}
```

---

## 4) Threshold Profiles (config file)

`verification.profiles.json`

```json
{
  "content_default": {
    "word_min": 400,
    "word_tolerance": 0,
    "strict": true
  },
  "code_update": {
    "lint": "required",
    "tests": "required",
    "coverage_min": 0.90,
    "build_required": true
  },
  "link_check": {
    "resample_failures": 5,
    "timeout_ms": 5000,
    "treat_3xx_as_pass": true
  },
  "db_update": {
    "rows_expected": "strict",
    "checksum_mode": "row_hash"
  },
  "api_scrape": {
    "schema_required": true,
    "items_min": "expected_total"
  }
}
```

---

## 5) LLM Prompt Templates (ready to use)

### 5.1 Claude (Executor) — USER PROMPT TEMPLATE

```
You are the Executor. Task:
<USER_INSTRUCTION>

1) Extract COMMITMENTS (expected_total, quality, scope).
2) Perform the work deterministically.
3) Output CLAIM JSON exactly per schema 3.2.
4) Emit artifacts required by the task type (files/diffs/reports/lists).
5) Do NOT say “done” without measurable evidence.

Return only:
- Work products (files/diffs/logs) as requested by toolchain.
- CLAIM JSON in a fenced block tagged `json`.
```

**Examples (what to emit):**

* **Content:** N files created, each ≥ word\_min; list paths in `units_list`.
* **Code:** modified files; functions/endpoints touched; lint/tests/coverage outputs.
* **Links:** discovered set + reported status for each; `units_list` is full URL list.

### 5.2 Gemini (Verifier) — USER PROMPT TEMPLATE

```
You are the Verifier. Given:
- COMMITMENT JSON (3.1)
- CLAIM JSON (3.2)
- ARTIFACTS JSON (3.3)
- PROFILE (thresholds)

Verify:
1) Quantity: expected_total vs verified units.
2) Quality: word_min, coverage_min, lint/tests/build, HTTP statuses, DB/API constraints.
3) Claim alignment: units_list & files/functions claimed match artifacts/diffs.

If externals are flaky (links/APIs), re-sample using provided settings.
Return VERDICT JSON (3.4) only, with granular per_unit reasons on any failure.
```

---

## 6) Code-Aware Verification (required behaviors)

* **Diff parsing:** map to claimed endpoints/functions (name/path heuristics).
* **Lint:** run configured linter; non-zero exit → fail.
* **Tests:** run suite; record pass ratio; collect coverage %.
* **Build/Typecheck:** required if profile says so.
* **Coverage gate:** fail if `< coverage_min`.
* **Alignment:** if claim lists 5 endpoints, verifier must see 5 touched in diffs.

---

## 7) Adapters (module responsibilities)

* `adapters/content.mjs` — word counts, file presence, quoted insertions.
* `adapters/code.mjs` — git diff parse, lint/tests/coverage/build.
* `adapters/links.mjs` — URL discovery set, status map, re-sample policy.
* `adapters/db.mjs` — before/after hashes, ids touched, column delta checks.
* `adapters/api.mjs` — count vs expected\_total, JSONSchema validation, sample payload checks.

---

## 8) SQLite v2 Schema (delta)

* `tasks(task_id PK, created_at, user_instruction, type, profile)`
* `commitments(task_id FK, expected_total INT, scope JSON, quality JSON)`
* `claims(task_id FK, claim_json JSON, claimed_total INT, created_at)`
* `artifacts(task_id FK, kind TEXT, payload JSON, created_at)`
* `verifications(task_id FK, status TEXT, summary TEXT, details JSON, coverage REAL, lint_errors INT, test_passed INT, test_total INT, created_at)`
* `units(task_id FK, unit_id TEXT, unit_type TEXT, claimed BOOL, verified BOOL, reason TEXT)`
* `metrics(task_id FK, k TEXT, v REAL, created_at)`

---

## 9) Acceptance Criteria (MVP-v2)

1. **Structured claims:** Every Claude run stores valid CLAIM JSON; missing → auto-fail.
2. **Granular diffs:** Code tasks show per-file/per-function verification.
3. **Coverage gate:** Enforced via profile (default ≥ 90%).
4. **Links:** If commitment says “check all”, units = discovered set; verified count equals discovered count; re-sample failed URLs.
5. **DB/API:** Row/item counts match expectations; schema validated.
6. **Dashboard:** Commitment | Claim | Verified columns align; filters for FAIL, task type; history retained.
7. **Tests:** Suite includes: full pass, partial pass, mislabeled claim, missing units, flaky links, coverage < gate.

---

## 10) Test Matrix (copy to `run-all-tests.sh` plan)

* **CONTENT\_10x400\_PASS** → pass; 10/10 ≥400.
* **CONTENT\_7of10\_FAIL** → fail; report missing 3 with paths.
* **CODE\_5\_ENDPOINTS\_LOGGING** → modify 5; lint/tests/coverage>=90%; pass.
* **CODE\_4of5\_FAIL\_ALIGN** → fail; reason “endpoint deleteUser missing logging”.
* **CODE\_COVERAGE\_85\_FAIL** → fail; coverage below profile.
* **LINKS\_25\_ALL\_OK** → pass; include resample log.
* **LINKS\_25\_TWO\_SKIPPED\_FAIL** → fail; per-URL reasons.
* **DB\_14\_ROWS\_UPDATED\_PASS** → ids match, hash changes verified.
* **API\_100\_ITEMS\_SCHEMA\_PASS** → count & schema OK.

---

## 11) Failure Semantics (standardized)

* **status:** `fail` if any required threshold breached; `partial` if soft targets missed but ≥ min required; `pass` otherwise.
* **reason codes:** `MISSING_UNIT`, `WORD_MIN`, `DIFF_MISMATCH`, `LINT_FAIL`, `TEST_FAIL`, `COVERAGE_FAIL`, `BUILD_FAIL`, `HTTP_FAIL`, `SCHEMA_FAIL`, `DB_COUNT_MISMATCH`.

---

## 12) Developer Notes

* **Claude must always return CLAIM JSON.** If not parsable → auto-fail with `MISSING_CLAIM`.
* **Determinism:** prefer tool outputs (lint/test/coverage) over text summaries.
* **Resampling:** links/APIs retry policy comes from profile; include retry transcript in artifacts.

---

## 13) Ready-to-paste “Start Task” wrapper (pre-hook → Claude)

```
SYSTEM (Claude): Use the Executor rules above.
USER:
<USER_INSTRUCTION>

Return:
1) Files/diffs/logs as appropriate.
2) A single fenced `json` block with CLAIM JSON (schema 3.2).
Do not claim success without measurable evidence.
```

## 14) Ready-to-paste “Verify Task” wrapper (post-hook → Gemini)

```
SYSTEM (Gemini): Use the Verifier rules above.
USER:
Here are inputs:
- COMMITMENT JSON:
<json_commitment>

- CLAIM JSON:
<json_claim>

- ARTIFACTS JSON:
<json_artifacts>

- PROFILE JSON:
<json_profile>

Return only VERDICT JSON (schema 3.4).
```

---

This PRD is **LLM-ready**: the roles, contracts, schemas, prompts, thresholds, and acceptance tests are explicit. Plug into your existing hooks, add adapters, and you’ve got a universal, code-aware verification layer.

