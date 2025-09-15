# GitHub Actions Setup Guide

## Overview

This repository includes GitHub Actions workflows for automated verification of code changes, API endpoints, and system health. The workflows integrate with the MCP Gemini Adjudicator verification system.

## Workflows

### 1. PR Verification (`verify-pr.yml`)

**Triggers:**
- Pull request opened, updated, or reopened
- Push to main/master branch

**What it does:**
- Runs code verification adapters (diff, lint, tests, coverage)
- Performs function mapping to detect missing implementations
- Enforces verification gates based on profiles
- Comments results on the PR
- Uploads verification artifacts

**Configuration:**
- Edit `config/profiles.json` to adjust verification thresholds
- Modify coverage requirements in the workflow file

### 2. Scheduled Verification (`scheduled-verification.yml`)

**Triggers:**
- Daily at 2 AM UTC
- Manual trigger with verification type selection

**What it does:**
- System health check
- Code quality verification
- API endpoint monitoring
- Creates issues on failure

**Configuration:**
- Add your production API endpoints to monitor
- Adjust the cron schedule as needed

### 3. Manual Verification (`manual-verify.yml`)

**Triggers:**
- Manual workflow dispatch with inputs

**Inputs:**
- `target_url`: URL to verify
- `schema_path`: Path to JSON schema
- `verification_profile`: Profile to use (strict/relaxed/etc)

**What it does:**
- On-demand verification of specific endpoints
- Flexible profile selection
- Full artifact generation and persistence

## Setup Instructions

### Step 1: Enable GitHub Actions

1. Go to your repository on GitHub
2. Click on "Settings" → "Actions" → "General"
3. Under "Actions permissions", select "Allow all actions and reusable workflows"
4. Click "Save"

### Step 2: Configure Required Files

Ensure these files exist in your repository:

```bash
# Required configuration files
config/profiles.json         # Verification profiles
config/adapter-plan.json     # Adapter capability mapping
tools/enforce-gate.mjs       # Gate enforcement logic
tools/build-artifacts-index.mjs  # Artifact indexer
tools/persist-verdict-to-sqlite.mjs  # Database persistence
```

### Step 3: Set Up NPM Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --ext .js,.mjs",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "build": "echo 'Add your build command here'"
  }
}
```

### Step 4: Create Initial Database Schema

Create a script to initialize the database:

```bash
#!/bin/bash
# init-db.sh
for migration in src/migrations/*.sql; do
  sqlite3 verify.sqlite < "$migration"
done
```

### Step 5: Test Workflows Locally

Use [act](https://github.com/nektos/act) to test workflows locally:

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash  # Linux

# Test PR workflow
act pull_request -W .github/workflows/verify-pr.yml

# Test manual workflow
act workflow_dispatch -W .github/workflows/manual-verify.yml
```

## Customization

### Adding Custom Verification Steps

Edit the workflow files to add custom steps:

```yaml
- name: Custom verification
  run: |
    # Your custom verification logic
    node tools/my-custom-verifier.js
```

### Adjusting Verification Profiles

Edit `config/profiles.json`:

```json
{
  "strict": {
    "lint_clean": true,
    "tests_pass": true,
    "coverage_min": 90,
    "function_certainty_required": "certain"
  },
  "relaxed": {
    "lint_clean": false,
    "tests_pass": true,
    "coverage_min": 60,
    "function_certainty_required": "fuzzy"
  }
}
```

### Monitoring Additional APIs

In `scheduled-verification.yml`, add your APIs:

```json
[
  {
    "url": "https://api.yourservice.com/health",
    "schema": "schemas/health.schema.json"
  },
  {
    "url": "https://api.yourservice.com/v1/status",
    "schema": "schemas/status.schema.json"
  }
]
```

## Troubleshooting

### Common Issues

1. **Workflow not triggering:**
   - Check GitHub Actions is enabled in repository settings
   - Verify workflow file syntax with `yamllint`
   - Check branch protection rules

2. **Adapters not found:**
   - Ensure adapter dependencies are installed: `cd adapters/code && npm ci`
   - Check adapter manifest files exist
   - Verify `tools/resolve-adapter.js` can find adapters

3. **Database errors:**
   - Run migrations: `sqlite3 verify.sqlite < src/migrations/002_units.sql`
   - Check file permissions on `verify.sqlite`

4. **Verification always failing:**
   - Review `config/profiles.json` thresholds
   - Check adapter output in artifacts
   - Look at `verdict.json` for specific failure reasons

### Debugging

Enable debug output by adding to workflow:

```yaml
env:
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true
```

View artifacts:
1. Go to Actions tab
2. Click on a workflow run
3. Scroll to "Artifacts" section
4. Download verification artifacts

## Security Considerations

### Secrets Management

Never commit sensitive data. Use GitHub Secrets:

1. Go to Settings → Secrets and variables → Actions
2. Add secrets like `API_KEY`, `DATABASE_URL`
3. Reference in workflows: `${{ secrets.API_KEY }}`

### Permissions

The workflows use minimal permissions. To restrict further:

```yaml
permissions:
  contents: read
  pull-requests: write  # Only for PR comments
  issues: write        # Only for creating issues
```

## Monitoring

### Workflow Status Badge

Add to your README:

```markdown
![Verification](https://github.com/YOUR_USERNAME/mcp-gemini-adjudicator/actions/workflows/verify-pr.yml/badge.svg)
```

### Notifications

Set up notifications:
1. Go to Settings → Notifications
2. Configure email/Slack for workflow failures

## Next Steps

1. **Test PR Workflow**: Create a test PR to verify the workflow runs
2. **Configure Scheduled Runs**: Adjust timing and APIs to monitor
3. **Set Up Alerts**: Configure notifications for failures
4. **Add Custom Adapters**: Extend with your own verification adapters
5. **Dashboard Integration**: Connect monitoring dashboard to workflow results

## Support

- Check workflow logs in the Actions tab
- Review artifacts for detailed verification results
- Consult `testend.md` for end-to-end testing procedures
- Open issues for workflow problems

---

The GitHub Actions workflows are now ready to use! Push this to your repository and create a test PR to see them in action.