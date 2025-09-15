Let's prove the whole syste works Here’s a tight **end-to-end validation playbook** to prove the whole system works together (migrations, adapters, gate, verifier, CI, and monitors).  
You will run each then come back and read this and go to the next until done.

---

# 0) One-command system check (add this helper)

Create `tools/system-check.mjs` to sanity-scan the repo:

```js
#!/usr/bin/env node
import fs from "fs"; import path from "path"; const ok=x=>console.log("✔",x), bad=x=>{console.error("✖",x); process.exitCode=1; };
const must = p => fs.existsSync(p) ? ok(p) : bad(`MISSING ${p}`);
must(".claude/hooks/pre-task-verification.sh");
must(".claude/hooks/post-task-verification-enhanced.sh");
must("config/verification.profiles.json");
must("config/adapter-plan.json");
["adapters","verifier","tools","schemas","monitoring"].forEach(must);
for (const d of fs.readdirSync("adapters")) {
  const m = `adapters/${d}/manifest.json`; if (fs.existsSync(m)) ok(m); else bad(`MISSING ${m}`);
}
console.log("Done. If any ✖ printed above, fix before running e2e.");
```

Run: `node tools/system-check.mjs` → **no red ✖**.

---

# 1) Database & migrations are loaded

## 1.1 Apply migrations (simple runner or your existing one)

If you don’t already have a runner, add `npm run migrate` to apply `src/migrations/*.sql` in order.

**Verify tables/columns exist:**

```bash
sqlite3 verify.sqlite '.schema units'
sqlite3 verify.sqlite '.schema metrics'
sqlite3 verify.sqlite "SELECT name FROM sqlite_master WHERE type='table';"
```

**Green if:** `units(task_id, unit_id, unit_type, claimed, verified, reason, created_at)` and `metrics(task_id,k,v,created_at)` exist.

**Sanity inserts (optional):**

```bash
sqlite3 verify.sqlite "INSERT INTO metrics(task_id,k,v) VALUES('smoke','ping',1.0);"
sqlite3 verify.sqlite "SELECT * FROM metrics WHERE task_id='smoke';"
```

---

# 2) Adapter discovery & plan consistency

**Check manifests & plan:**

```bash
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("config/adapter-plan.json","utf8"));console.log(Object.keys(p))'
node tools/resolve-adapter.js code:diff
node tools/resolve-adapter.js links:discover
```

**Green if:** each capability in `adapter-plan.json` resolves to a binary via a manifest.

---

# 3) Hooks order & fast-fail behavior

**Order:** adapters → artifacts index → checksums → (LLM-zero gate) → (Gemini if needed) → enforce gate → persist to SQLite.

**Quick grep:**

```bash
grep -nE 'adapter-|artifacts.json|checksums|enforce-gate|verifier/gemini' .claude/hooks/post-task-verification-enhanced.sh
```

**Green if:** you see adapters first, Gemini only after artifacts.

**Fast-fail test (missing claim/artifact):**

```bash
export TASK_ID=fail_claim && rm -rf .artifacts/$TASK_ID && mkdir -p .artifacts/$TASK_ID
bash .claude/hooks/post-task-verification-enhanced.sh ; echo $?
# Expect non-zero with MISSING_CLAIM before any Gemini call
```

---

# 4) Golden-path E2E (code task)

**Setup a tiny repo state with a guaranteed lint/test pass:**

* Ensure there is at least one test and linter configured (or relax profile temporarily).

**Run:**

```bash
export TASK_ID=code_pass
bash .claude/hooks/pre-task-verification.sh
bash .claude/hooks/post-task-verification-enhanced.sh
jq '.status,.reasons' .artifacts/$TASK_ID/verdict.json
node tools/persist-verdict-to-sqlite.mjs ".artifacts/$TASK_ID"
sqlite3 verify.sqlite "SELECT COUNT(*) FROM units WHERE task_id='$TASK_ID';"
```

**Green if:** `status` is `"pass"`, units persisted > 0.

**Intentional fail (lint or coverage):**

```bash
export TASK_ID=code_fail
# introduce a lint error or set coverage_min higher than report
bash .claude/hooks/pre-task-verification.sh
bash .claude/hooks/post-task-verification-enhanced.sh ; echo $?
jq '.status,.reasons' .artifacts/$TASK_ID/verdict.json
```

**Green if:** exit is non-zero and reasons include `LINT_FAIL` / `COVERAGE_FAIL` / `DIFF_MISMATCH` as appropriate.

---

# 5) Golden-path E2E (links task)

**Success case:**

```bash
export TASK_ID=links_pass
# set commitment to a page with healthy links (or treat_3xx_as_pass=true)
bash .claude/hooks/pre-task-verification.sh
bash .claude/hooks/post-task-verification-enhanced.sh
jq '.status' .artifacts/$TASK_ID/verdict.json
```

**Fail case (ensure at least one bad URL):**

```bash
export TASK_ID=links_fail
bash .claude/hooks/pre-task-verification.sh
bash .claude/hooks/post-task-verification-enhanced.sh ; echo $?
jq '.status,.reasons' .artifacts/$TASK_ID/verdict.json
jq 'length' .artifacts/$TASK_ID/links/urlset.json
jq 'keys|length' .artifacts/$TASK_ID/links/statuses.json
```

**Green if:** non-zero exit on fail; and **coverage check holds** (`len(statuses) == len(urlset)` enforced by gate; unresolved failures listed).

---

# 6) LLM-zero vs Gemini branching

Force a deterministic pass/fail so the **LLM-zero** quick verdict applies (no Gemini call). Then force an **alignment** case (e.g., ambiguous function mapping) to ensure Gemini runs.

**Check logs or a flag file** the hook writes when skipping/using Gemini (add this if you haven’t):

* Write `.artifacts/<task_id>/verifier_used.txt` with `none` or `gemini`.

**Green if:** you see `none` for deterministic runs and `gemini` for alignment needed.

---

# 7) CI workflow sanity

Open a PR that:

* **Fails** (lint/test/links) → check is **red** with JUnit reasons.
* **Fixes** → check turns **green**.

**Artifacts available:** confirm the run uploaded `.artifacts/<task_id>` or a zip artifact as configured in the workflow.

---

# 8) Persistence & monitors

## 8.1 Persist on every run

Make sure the post-hook or CI step calls:

```bash
node tools/persist-verdict-to-sqlite.mjs ".artifacts/$TASK_ID"
```

## 8.2 API endpoints return per-unit

```bash
curl -s http://localhost:4000/api/tasks | jq '.[-1]'          # last task
curl -s http://localhost:4000/api/tasks/<task_id>/units | jq '.[0:5]'
```

**Green if:** per-unit rows come back `{unit_id, unit_type, claimed, verified, reason}`.

## 8.3 Dashboard renders per-unit

Open your enhanced dashboard detail view for the last task:

* Table shows all units with filters (type, ok/fail).
* New **reasons** (e.g., `MISSING_UNIT`, `DIFF_MISMATCH`) visible.

**If not visible:** extend `enhanced-server.mjs` to include `/api/tasks/:id/units`, and update `enhanced-dashboard.html` to fetch/render it.

---

# 9) Integrity: checksums

Tamper test:

```bash
export TASK_ID=integrity
bash .claude/hooks/pre-task-verification.sh
bash .claude/hooks/post-task-verification-enhanced.sh
# corrupt an artifact
echo "x" >> .artifacts/$TASK_ID/links/statuses.json
node tools/ci-validate-artifacts.mjs ".artifacts/$TASK_ID" ; echo $?
```

**Green if:** CI validator exits non-zero with `CHECKSUM_MISMATCH` or JSON parse error.

---

# 10) Compatibility matrix (quick smoke set)

* **Code**

  * PASS: diff+lint+tests+coverage ok
  * FAIL: lint error
  * FAIL: coverage below profile
  * FAIL: claimed 5 endpoints, diff maps 4 → `DIFF_MISMATCH`

* **Links**

  * PASS: all discovered links ok (after resample)
  * FAIL: discovered 25, verified 23 → `MISSING_UNIT`
  * FAIL: unresolved 4xx/timeout after resample

* **Claim/Artifacts**

  * FAIL: missing `claim.json` → fast fail
  * FAIL: required artifact missing (coverage.json when required) → fast fail

---

# Will the monitors work with the new capability?

**Yes—if you wire these two things:**

1. **Persist per-unit & metrics** (ASK A you implemented).

   * After every run, call `tools/persist-verdict-to-sqlite.mjs`.
   * Ensure `units` + `metrics` tables exist (Migration 002).

2. **Expose & render per-unit**

   * **Server:** `/api/tasks/:taskId/units` and `/api/tasks/:taskId/metrics`.
   * **UI:** in the task detail panel show:

     * Summary chips: PASS/FAIL, counts (claimed vs verified), reasons histogram.
     * Table: unit\_id | type | claimed | verified | reason.
     * Optional: “Open artifact” links (e.g., show `diffs.patch` slice or link status details).

**Acceptance for monitors**

* Recent run appears in the list with the correct status.
* Clicking a run shows per-unit rows and reasons.
* Counts match: `claimed == units_total` in claim; `verified == number of per_unit.ok`.

---

# Optional hardening (fast wins)

* **/health endpoint** in `enhanced-server.mjs`:

  * returns versions (git SHA), schema version, last task time, and counts of adapters discovered.
* **Version manifest** file `version.json` written on build with schema & adapter versions.
* **Slo/latency metric**: add `metrics` rows for adapter durations (to spot slow crawls).

---

## Done-ness checklist (green = you’re integrated)

* [ ] `system-check.mjs` prints only ✔.
* [ ] Migrations applied; `units` + `metrics` tables present.
* [ ] Adapters discovered; plan resolves to binaries.
* [ ] Hooks run in correct order; fast-fail on missing claim/artifacts.
* [ ] Code & links E2E: one pass and one fail each, with clear reasons.
* [ ] LLM-zero path observed on deterministic runs; Gemini used only for alignment.
* [ ] CI PR check red/green with JUnit details and artifacts uploaded.
* [ ] Dashboard shows per-unit results & reasons for latest task.

If any step falters, tell me which command/acceptance failed and I’ll zero in on the fix.

