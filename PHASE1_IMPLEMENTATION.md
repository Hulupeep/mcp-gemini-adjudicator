# Phase 1 Implementation - MCP Gemini Adjudicator

## ✅ Phase 1 Complete - Single Source of Truth

This is the **OFFICIAL** Phase 1 implementation of the MCP Gemini Adjudicator verification system.
All code is now consolidated in `/home/xanacan/Dropbox/code/mcp-gemini-adjudicator/`

## 🎯 What Phase 1 Does

Phase 1 implements **CLAIM JSON Enforcement** per PRD v2:
- Automatically extracts task commitments from user prompts
- Expects Claude to output structured CLAIM JSON after completing work
- Verifies actual work against claims
- Auto-fails if no CLAIM JSON is provided
- Tracks everything: Commitment → Claim → Verdict

## 📁 Project Structure

```
mcp-gemini-adjudicator/
├── .claude/
│   ├── hooks/
│   │   ├── pre-task-commitment.sh     # Extracts commitments from prompts
│   │   ├── post-task-claim.sh         # Verifies claims after work
│   │   └── ...                         # Other hooks
│   ├── settings.json                   # Hook configuration
│   └── verification/                   # Runtime data storage
│       ├── commitment.json             # What was expected
│       ├── claim.json                  # What Claude claimed
│       └── verdict.json                # Verification result
├── src/
│   ├── adapters/
│   │   └── content.mjs                # Content verification adapter
│   ├── gemini-verifier.mjs            # Gemini AI verification
│   └── storage-sqlite.mjs             # SQLite storage
├── monitoring/
│   ├── public/
│   │   ├── phase1-dashboard.html      # Real-time monitoring dashboard
│   │   └── index.html                  # Original dashboard
│   └── server.js                       # Monitoring server
├── verification.profiles.json          # Verification profiles config
├── prd2.md                             # PRD v2 specification
└── test-phase1.sh                      # Phase 1 test script
```

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Navigate to the main project folder (NOT testgem)
cd /home/xanacan/Dropbox/code/mcp-gemini-adjudicator

# Install dependencies if needed
npm install

# Create verification directory
mkdir -p .claude/verification
```

### 2. Start Monitoring Server (Optional)

```bash
# In a separate terminal
node monitoring/server.js

# Access dashboard at http://localhost:4000/phase1-dashboard.html
```

### 3. Configure Claude

When starting a new Claude session, provide these instructions:

```
IMPORTANT: You are the Executor in a verification system. For EVERY task:

1. Do the work as requested
2. Output a CLAIM JSON block at the END of your response

CLAIM JSON Format (REQUIRED):
```json
{
  "task_id": "task-[timestamp]",
  "claimed": {
    "type": "content|code|link_check",
    "units_total": [number created/modified],
    "units_list": ["file1.md", "file2.md"],
    "files_modified": ["path/to/file1"],
    "word_min": [minimum words],
    "notes": "What was done"
  }
}
```

Missing CLAIM JSON = automatic verification failure!
```

## 🧪 Test Examples

### Test 1: Blog Creation
```bash
# User prompt:
"Create 5 blog posts about AI, 400 words each, save in testblog folder"

# Expected behavior:
1. Pre-hook extracts: expected_total=5, word_min=400
2. Claude creates 5 files
3. Claude outputs CLAIM JSON with units_total=5
4. Post-hook verifies all 5 files have 400+ words
5. Verdict: PASS or FAIL with reasons
```

### Test 2: Content Modification
```bash
# User prompt:
"Add 'Updated: 2025' to all markdown files in docs folder"

# Expected behavior:
1. Pre-hook extracts task type and target directory
2. Claude modifies files
3. Claude outputs CLAIM JSON with files modified
4. Post-hook verifies modifications were made
5. Verdict shows per-file results
```

## 📊 Verification Flow

```
User Request
     ↓
pre-task-commitment.sh extracts COMMITMENT
     ↓
Claude performs work
     ↓
Claude outputs CLAIM JSON (or auto-fail)
     ↓
post-task-claim.sh runs verification
     ↓
VERDICT (PASS/FAIL with details)
```

## 🔍 What Gets Verified

### Phase 1 Verifies:
- ✅ Number of files created/modified matches commitment
- ✅ Word count minimums are met
- ✅ Files actually exist
- ✅ Modifications were actually made
- ✅ CLAIM JSON is provided

### Phase 1 Auto-Fails When:
- ❌ No CLAIM JSON provided by Claude
- ❌ Fewer units created than committed
- ❌ Word count below minimum threshold
- ❌ Claimed files don't exist
- ❌ No actual modifications detected

## 📈 Monitoring & Results

### View Results in Real-Time:

1. **Logs**: `tail -f .claude/hooks/verification.log`
2. **JSON Files**:
   - Commitment: `.claude/verification/commitment.json`
   - Claim: `.claude/verification/claim.json`
   - Verdict: `.claude/verification/verdict.json`
3. **Dashboard**: http://localhost:4000/phase1-dashboard.html

### Dashboard Shows:
- Total tasks processed
- Pass/fail rates
- Claims received
- Average completion percentage
- Per-task breakdown with:
  - Commitment (what was expected)
  - Claim (what Claude claimed)
  - Verdict (what was verified)

## 🛠️ Run the Test

```bash
# Run the automated Phase 1 test
./test-phase1.sh

# This will:
# 1. Create test commitments
# 2. Simulate Claude's work
# 3. Generate CLAIM JSON
# 4. Run verification
# 5. Show PASS/FAIL verdict
```

## ⚠️ Important Notes

1. **This is the single source of truth** - Use this folder, not testgem
2. **Claude MUST output CLAIM JSON** - Without it, verification auto-fails
3. **Hooks must be active** - Check `.claude/settings.json` has Phase 1 hooks
4. **Default target is testblog/** - Can be overridden in prompts

## 🔄 Next Phases

- **Phase 2**: Code verification (lint, test, coverage)
- **Phase 3**: Link checking and API verification
- **Phase 4**: Advanced quality metrics

## 📝 Key Files Reference

| File | Purpose |
|------|---------|
| `pre-task-commitment.sh` | Extracts requirements from user prompts |
| `post-task-claim.sh` | Verifies work and creates verdict |
| `src/adapters/content.mjs` | Content verification logic |
| `verification.profiles.json` | Task type configurations |
| `phase1-dashboard.html` | Real-time monitoring UI |

## 🎯 Success Criteria

Phase 1 is successful when:
1. System correctly extracts task quantities from prompts
2. Claude outputs CLAIM JSON after work
3. Verification accurately counts created/modified items
4. Dashboard shows real-time Commitment/Claim/Verdict data
5. System fails when work doesn't match claims

## Summary

The MCP Gemini Adjudicator Phase 1 is now fully operational in the main project folder. It tracks:
- **What was requested** (Commitment)
- **What Claude claims** (CLAIM JSON)
- **What was actually done** (Verification)
- **Pass/Fail verdict** with detailed reasons

This ensures AI completes the requested quantity and quality of work!