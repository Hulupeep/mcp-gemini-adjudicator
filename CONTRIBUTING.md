# Contributing

Thanks for helping keep LLMs honest ⚖️. This project welcomes issues, PRs, and new **adapters**.

## Principles

* **Deterministic by default.** Adapters produce facts; they never decide pass/fail.
* **Evidence over narratives.** No measured results in Claim JSON; all evidence lives in artifacts.
* **Sandboxed.** Adapters declare tools/timeouts/net use; the core enforces it.
* **Composable.** New domains come via adapters, not core rewrites.

## Dev setup

```bash
git clone https://github.com/Hulupeep/mcp-gemini-adjudicator
cd mcp-gemini-adjudicator
npm ci || true
pip install -r requirements.txt || true
```

Run a local flow:

```bash
bash .claude/hooks/pre-task-commitment.sh
bash .claude/hooks/post-task-claim-v2.sh
```

## Project layout (high-level)

```
adapters/
  code/                        # first-party adapter (code)
  links/                       # first-party adapter (links)
  content/                     # first-party adapter (content)
  api/                         # first-party adapter (api)
verifier/gemini.mjs            # reads artifacts only; outputs verdict.json
tools/
  resolve-adapter.js           # capability -> adapter binary
  build-artifacts-index.mjs
  enforce-gate.mjs             # fast path verdict enforcement
  validate-claim.mjs           # claim schema validation
  verdict-to-junit.mjs
config/
  adapter-plan.json            # task type -> capability pipeline
  verification.profiles.json   # thresholds
schemas/
  verify.claim.v1_1.schema.json
  (optional) artifact schemas
```

## How adapters work (in brief)

* **Manifest** (`adapters/<name>/manifest.json`) declares capabilities and entrypoint.
* **CLI** (`adapters/<name>/bin/adapter-<name>`) implements subcommands (capabilities).
* **Contract**: invoked like:

```bash
adapter-<name> <capability> \
  --task-dir .artifacts/<task_id> \
  --commitment .artifacts/<task_id>/commitment.json \
  --claim .artifacts/<task_id>/claim.json \
  --profile config/verification.profiles.json
```

* **Outputs**: writes JSON/files to `--task-dir` (e.g., `diffs.patch`, `lint.json`, `links/urlset.json`). Exit **0** unless the adapter itself crashes.

**Adapters never:**

* Write verdicts or set pass/fail.
* Modify code/content outside `--task-dir`.
* Embed LLM output as "facts."

## Adding a new adapter (checklist)

1. Scaffold with **packages/adapter-template** (or copy an existing adapter).
2. Fill **manifest.json** with capabilities (e.g., `"api:check"`).
3. Implement CLI subcommands; write artifacts to `--task-dir`.
4. Add fixtures and unit tests (deterministic outputs).
5. Update **config/adapter-plan.json** to route your type → capabilities.
6. Update **docs/ADAPTERS.md** with capability reference.

## Coding standards

* Keep outputs **small, JSON-first**, and stable between runs.
* Log noisy stuff to `stderr`; write only artifacts to files/`stdout` as documented.
* Include `timeout_ms` and `requires.net` in your manifest; the core will enforce.
* Prefer pure Node/TS or Bash; Python is fine if you pin versions in the adapter README.

## Tests & CI

* Each adapter should include fixtures and a golden-output test.
* The repo CI runs the post-hook on a tiny sample project + a link-check page, converts `verdict.json` to JUnit, and publishes results.

## Versioning & schemas

* Schemas live in `/schemas`. Breaking changes bump **major**.
* Adapters use semver; manifests declare capabilities and version.
* Core resolves compatible adapters by manifest; multiple adapters can provide the same capability (core picks one deterministically).

## Security

* Adapters run in a jailed working dir under `.artifacts/<task_id>`.
* Network defaults **off** unless declared in manifest.
* Long-running or crawling adapters must respect `timeout_ms` and any host throttle settings.

## Pull Request Guidelines

1. **For bug fixes**: Include a test that fails without your fix
2. **For new adapters**: Include manifest, implementation, tests, and documentation
3. **For features**: Discuss in an issue first
4. **All PRs**: Update relevant documentation

## Testing Your Changes

```bash
# Run a specific adapter
export TASK_ID=T_test && mkdir -p .artifacts/$TASK_ID
adapters/code/bin/adapter-code code:diff --task-dir .artifacts/$TASK_ID

# Test the full flow
./test-phase1.sh  # Content verification
./test-phase2.sh  # Code verification
./test-phase3.sh  # Link verification

# Check your changes don't break existing functionality
npm test
```

## Getting Help

* Open an issue for bugs or feature requests
* Check existing issues and PRs before starting work
* Join discussions in issues for design decisions