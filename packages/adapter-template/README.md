# Template Adapter

A template for creating new verification adapters for the MCP Gemini Adjudicator system.

## Overview

This adapter demonstrates the standard patterns and best practices for building deterministic verification adapters. Use it as a starting point for creating your own domain-specific adapters.

## Features

- ✅ Full CLI contract implementation
- ✅ Deterministic artifact generation
- ✅ Three example capabilities (scan, validate, analyze)
- ✅ Comprehensive manifest with sandbox configuration
- ✅ Test fixtures and examples
- ✅ Verbose mode for debugging

## Quick Start

### 1. Copy this template

```bash
cp -r packages/adapter-template packages/adapter-myname
cd packages/adapter-myname
```

### 2. Update the manifest

Edit `manifest.json`:
- Change `name` to your adapter name
- Update `capabilities` with your domain-specific capabilities
- Adjust `sandbox` settings as needed
- Update `metadata` URLs

### 3. Implement capabilities

Replace the example implementations in `src/`:
- Each capability should have its own module
- Keep operations deterministic (no timestamps in output)
- Sort arrays before writing
- Use stable IDs and hashes

### 4. Test your adapter

```bash
# Basic test
export TASK_ID=T_test
mkdir -p .artifacts/$TASK_ID

# Create test claim
cat > .artifacts/$TASK_ID/claim.json << EOF
{
  "schema": "verify.claim/v1.1",
  "actor": "test",
  "task_id": "$TASK_ID",
  "timestamp": "2024-01-15T10:00:00Z",
  "claim": {
    "type": "template",
    "units_total": 3,
    "units_list": ["file1.js", "file2.ts", "test/spec.js"]
  }
}
EOF

# Run your adapter
bin/adapter-template template:scan \
  --task-dir .artifacts/$TASK_ID \
  --claim .artifacts/$TASK_ID/claim.json \
  --verbose

# Check output
cat .artifacts/$TASK_ID/template/scan.json
```

## Capabilities

### template:scan

Scans and analyzes input units.

**Output:** `template/scan.json`
```json
{
  "schema": "template.scan/v1.0",
  "items_scanned": [...],
  "summary": {...},
  "metrics": {...}
}
```

### template:validate

Validates configuration and claim format.

**Output:** `template/validate.json`
```json
{
  "schema": "template.validate/v1.0",
  "valid": true,
  "checks": [...],
  "errors": [],
  "warnings": []
}
```

### template:analyze

Performs detailed analysis with insights.

**Output:** `template/analyze.json`
```json
{
  "schema": "template.analyze/v1.0",
  "analysis": {...},
  "statistics": {...},
  "insights": [...]
}
```

## CLI Contract

```bash
adapter-template <capability> [options]

Options:
  --task-dir <path>      Directory for artifacts (required)
  --commitment <file>    Path to commitment.json
  --claim <file>         Path to claim.json
  --profile <file>       Path to verification profile
  --verbose              Enable verbose output
  --help                 Show help message
```

## Development Guidelines

### Determinism Requirements

✅ **DO:**
- Sort all arrays before writing
- Use consistent hash algorithms
- Report objective facts only
- Exit 0 even when checks fail
- Write errors to stderr

❌ **DON'T:**
- Include timestamps in artifact content
- Use random values or UUIDs
- Make subjective assessments
- Exit non-zero for check failures
- Include paths specific to your machine

### File Structure

```
adapter-myname/
├── manifest.json           # Adapter metadata and capabilities
├── package.json           # Node.js dependencies (if needed)
├── README.md              # Documentation
├── bin/
│   └── adapter-myname     # CLI entrypoint (executable)
├── src/
│   ├── capability1.mjs    # Implementation
│   ├── capability2.mjs    # Implementation
│   └── utils.mjs          # Shared utilities
└── tests/
    ├── fixtures/          # Test data
    └── test.mjs           # Unit tests
```

### Adding to the System

1. Place your adapter in `adapters/` directory
2. Update `config/adapter-plan.json` to include your capabilities
3. Test discovery: `node tools/resolve-adapter.js your:capability`
4. Run end-to-end test with the post-hook

## Testing

### Unit Tests

```bash
# Run tests
npm test

# Test specific capability
node tests/test-scan.mjs
```

### Integration Test

```bash
# Full flow test
export TASK_ID=T_integration
bash .claude/hooks/pre-task-commitment.sh
# ... create claim ...
bash .claude/hooks/post-task-claim-v2.sh
```

### Fixture Data

Test fixtures are in `tests/fixtures/`:
- `sample-claim.json` - Example claim
- `sample-commitment.json` - Example commitment
- `sample-profile.json` - Example profile

## Common Patterns

### Processing Units

```javascript
const units = claim?.claim?.units_list || [];
for (const unit of units) {
    // Process each unit deterministically
    const result = processUnit(unit);
    results.push(result);
}
// Always sort for deterministic output
results.sort((a, b) => a.id.localeCompare(b.id));
```

### Error Handling

```javascript
try {
    // Perform operation
} catch (error) {
    // Log to stderr for debugging
    console.error(`Error: ${error.message}`);
    // Record in artifact (not the error stack)
    results.errors.push({
        type: 'processing_error',
        unit: unitId,
        message: error.message
    });
    // Continue processing (don't exit)
}
```

### Profile Application

```javascript
const activeProfile = profile?.active || 'default';
const settings = profile?.[activeProfile] || {};

if (settings.strict_mode) {
    // Apply stricter validation
}
```

## Troubleshooting

### Adapter not found

```bash
# Check manifest exists
ls adapters/myname/manifest.json

# Test discovery
node tools/resolve-adapter.js myname:capability

# Check capability name matches exactly
grep capabilities adapters/myname/manifest.json
```

### Non-deterministic output

- Remove timestamps from artifact content
- Sort all arrays before writing
- Use stable IDs (not random)
- Check for machine-specific paths

### Exit codes

- Exit 0: Success (even if checks fail)
- Exit 1: Adapter crashed
- Exit 2: Invalid arguments

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on contributing adapters to the main repository.

## License

MIT