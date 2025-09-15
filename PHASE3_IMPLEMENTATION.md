# Phase 3 Implementation - Link & API Verification

## ✅ Phase 3 Complete - Deterministic Link/API Checking

Phase 3 adds **link discovery and verification** with **API endpoint validation**:
- Discover links from URLs, sitemaps, or HTML files
- Check HTTP status codes with concurrent requests
- Resample failed links with exponential backoff
- Validate API endpoints with schema checking
- Profile-based configuration for different strictness levels

## 🎯 What Phase 3 Does

Per PRD v2, Phase 3 implements:
- **Link discovery** from pages or sitemaps
- **Status checking** with configurable timeouts
- **Resampling** for transient failures
- **API validation** with response time checks
- **Evidence-based verification** (actual HTTP responses)

## 📁 New Components Added

```
mcp-gemini-adjudicator/
├── adapters/
│   ├── links/
│   │   ├── manifest.json              # Link adapter config
│   │   ├── bin/
│   │   │   └── adapter-links         # CLI dispatcher
│   │   └── src/
│   │       ├── discover.mjs          # Link discovery
│   │       ├── check.mjs             # Status checking
│   │       └── resample.mjs          # Retry logic
│   └── api/
│       ├── manifest.json              # API adapter config
│       ├── bin/
│       │   └── adapter-api           # CLI dispatcher
│       └── src/
│           └── check.mjs              # API validation
└── .artifacts/[TASK_ID]/
    ├── links/
    │   ├── urlset.json               # Discovered URLs
    │   ├── statuses.json             # HTTP status codes
    │   ├── resample.json             # Retry results
    │   └── discovery.json            # Discovery metadata
    └── api/
        ├── check.json                # API check results
        └── response.json             # Sample responses
```

## 🚀 How to Use Phase 3

### 1. Link Verification Pipeline

```bash
# Set up task
export TASK_ID=T_links_1
mkdir -p .artifacts/$TASK_ID

# Step 1: Discover links from a URL
adapters/links/bin/adapter-links links:discover \
    --task-dir .artifacts/$TASK_ID \
    --url https://example.com

# Step 2: Check all discovered links
adapters/links/bin/adapter-links links:check \
    --task-dir .artifacts/$TASK_ID \
    --profile verification.profiles.json

# Step 3: Resample failed links
adapters/links/bin/adapter-links links:resample \
    --task-dir .artifacts/$TASK_ID \
    --profile verification.profiles.json

# Or run all at once
adapters/links/bin/adapter-links links:all \
    --task-dir .artifacts/$TASK_ID \
    --url https://example.com
```

### 2. API Verification

```bash
# Create commitment with API endpoints
cat > .artifacts/$TASK_ID/commitment.json << EOF
{
  "type": "api_check",
  "profile": "api_basic",
  "commitments": {
    "scope": {
      "endpoints": [
        {"url": "https://api.example.com/users", "method": "GET"},
        {"url": "https://api.example.com/posts", "method": "GET"}
      ]
    }
  }
}
EOF

# Check API endpoints
adapters/api/bin/adapter-api api:check \
    --task-dir .artifacts/$TASK_ID \
    --commitment .artifacts/$TASK_ID/commitment.json \
    --profile verification.profiles.json
```

## 🔍 What Gets Verified

### Link Discovery (`discover.mjs`)
- ✅ Crawls HTML pages for links
- ✅ Parses XML sitemaps
- ✅ Handles sitemap indexes recursively
- ✅ Extracts from href, src attributes
- ✅ Deduplicates and validates URLs

### Link Checking (`check.mjs`)
- ✅ Concurrent HTTP HEAD/GET requests
- ✅ Configurable timeouts
- ✅ Rate limiting between batches
- ✅ Categorizes by status code (2xx, 3xx, 4xx, 5xx)
- ✅ Treats redirects as pass/fail per profile

### Link Resampling (`resample.mjs`)
- ✅ Retries failed links with exponential backoff
- ✅ Configurable retry attempts
- ✅ Tracks recovery rate
- ✅ Updates final statuses
- ✅ Detailed attempt logging

### API Checking (`api/check.mjs`)
- ✅ HTTP method support (GET, POST, etc.)
- ✅ Response time measurement
- ✅ Schema validation (optional)
- ✅ Content type detection
- ✅ Sample response storage

## 📊 Profile Configuration

### Link Profiles

```json
{
  "link_check": {
    "resample_failures": 3,        // Retry attempts
    "timeout_ms": 5000,            // Request timeout
    "treat_3xx_as_pass": true,     // Redirects OK
    "concurrent_checks": 5,        // Parallel requests
    "rate_limit_ms": 100          // Delay between batches
  },
  "link_strict": {
    "resample_failures": 5,
    "timeout_ms": 10000,
    "treat_3xx_as_pass": false,   // Redirects fail
    "require_full_coverage": true  // All must pass
  }
}
```

### API Profiles

```json
{
  "api_basic": {
    "timeout_ms": 10000,
    "validate_schema": false,
    "check_response_time": true,
    "max_response_time_ms": 2000
  },
  "api_strict": {
    "validate_schema": true,
    "require_all_endpoints": true,
    "max_response_time_ms": 1000
  }
}
```

## 📈 Gate Enforcement

The gate **FAILS** when:
- ❌ **LINK_MISSING**: Fewer links discovered than expected
- ❌ **LINK_COVERAGE**: Links still failed after resampling (strict mode)
- ❌ **API_FAILED**: API endpoints returned errors
- ❌ **API_SCHEMA**: Response doesn't match schema
- ❌ **RESPONSE_TIME**: API slower than threshold

## 🧪 Test Phase 3

```bash
# Run the automated test
./test-phase3.sh

# Test output shows:
# - Link discovery and checking
# - Failed link resampling
# - API endpoint validation
# - Pass/fail statistics
```

## 📊 Example Workflows

### Scenario 1: "Check all links on website"

```
1. User: "Check all links on https://example.com"

2. Pre-hook extracts:
   - type: "link_check"
   - source_url: "https://example.com"

3. Link adapter:
   - Discovers 150 links
   - Checks each with 5 concurrent requests
   - Finds 10 failures (404s, timeouts)
   - Resamples failures 3 times
   - Recovers 4 links, 6 still failed

4. Verdict:
   - 144/150 links pass (96%)
   - Profile allows some failures
   - Status: PASS
```

### Scenario 2: "Validate API endpoints"

```
1. User: "Check all /api/v2 endpoints return 200"

2. Commitment:
   - endpoints: ["/api/v2/users", "/api/v2/posts", ...]
   - profile: "api_strict"

3. API adapter:
   - Checks 10 endpoints
   - Measures response times
   - Validates against schema
   - 1 endpoint returns 500

4. Gate enforcement:
   - API_FAILED: 1 endpoint failed
   - require_all_endpoints = true
   - Status: FAIL
```

## ⚠️ Important Notes

1. **Static HTML only** - JavaScript-rendered links need future work
2. **Rate limiting** - Respects server limits with configurable delays
3. **Timeout handling** - Configurable per profile
4. **Evidence-based** - Actual HTTP responses, not text parsing
5. **Idempotent** - Re-runs produce same results

## 🔄 Integration with Previous Phases

The verification system now handles:
- **Phase 1**: Content verification (word counts, files)
- **Phase 2**: Code verification (lint, tests, coverage)
- **Phase 3**: Link/API verification (HTTP status, schemas)

All integrated with consistent:
- Commitment → Claim → Verdict flow
- Profile-based requirements
- Deterministic artifact generation
- Gate enforcement

## 🎯 Success Criteria

Phase 3 is successful when:
1. Links discovered match commitment ✅
2. Status checks are deterministic ✅
3. Resampling recovers transient failures ✅
4. API validation checks schemas ✅
5. Gate fails on unmet requirements ✅

## 📝 Key Commands Reference

| Command | Purpose |
|---------|---------|
| `links:discover` | Find links from URL/sitemap |
| `links:check` | Check HTTP status codes |
| `links:resample` | Retry failed links |
| `links:all` | Full pipeline |
| `api:check` | Validate API endpoints |

## Summary

Phase 3 adds **deterministic link and API verification**:
- Evidence-based checking (actual HTTP responses)
- Intelligent resampling for transient failures
- Profile-based pass/fail criteria
- Schema validation for APIs
- Comprehensive status tracking

This ensures all links work and APIs respond correctly!