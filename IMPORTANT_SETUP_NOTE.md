# ⚠️ IMPORTANT: Hook Integration Clarification

## The Reality: MCP Tools vs Hooks

There's a fundamental misunderstanding in how this works:

1. **MCP tools** (like `verify_with_gemini`) are **available** but **not automatic**
2. **Hooks** can run shell scripts but **cannot directly invoke MCP tools**
3. Claude must **explicitly call** MCP tools when needed

## Current State

✅ **What Works:**
- MCP server provides `verify_with_gemini` and `consensus_check` tools
- Claude CAN use these tools when asked
- Monitoring dashboard shows results when tools are used
- Hooks can prepare verification prompts

❌ **What Doesn't Work (as expected):**
- Automatic verification on every file change
- Hooks directly calling MCP tools
- "Fire and forget" verification

## The Solution: Three Approaches

### Option 1: Manual Invocation (Simplest)
Tell Claude explicitly when to verify:
```
"Create a function to calculate prime numbers, then use verify_with_gemini to check it"
```

### Option 2: Workflow Pattern
Create a standard workflow in Claude:
```
"For this session, after any code changes, always run verify_with_gemini"
```

### Option 3: Direct API Integration (Advanced)
The hooks can call Gemini API directly (bypassing MCP):

```bash
# In run_verification.sh, instead of trying to call MCP:
curl -X POST "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-exp:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [{
        \"text\": \"Verify this: $artifact_content\"
      }]
    }]
  }"
```

## Why This Confusion Exists

The original design assumed hooks could trigger MCP tools, but:
- MCP tools run in Claude's context
- Hooks run in your shell context
- They can't directly communicate

## Recommended Usage

### For Automatic Verification:
Use Option 3 - modify the hooks to call Gemini API directly

### For Interactive Verification:
Use Option 1 or 2 - explicitly ask Claude to verify

### For Best Results:
Combine both - hooks for automatic checks, MCP tools for on-demand verification

## Quick Fix for True Automation

Replace `.claude/hooks/run_verification.sh` with the production version that calls Gemini API directly:

```bash
cp .claude/hooks/run_verification_production.sh .claude/hooks/run_verification.sh
```

This bypasses MCP and calls Gemini directly from the hook!