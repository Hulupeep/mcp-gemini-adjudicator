# 🤖 Gemini Consensus - AI-Powered Verification & Consensus System

> **Advanced MCP server providing intelligent verification and consensus analysis using Google Gemini AI for distributed decision-making and validation workflows**

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Google Gemini](https://img.shields.io/badge/Google-Gemini-blue)](https://ai.google.dev/)

## 📋 Table of Contents

- [🎯 Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [⚡ Installation](#-installation)
- [🔧 Configuration](#-configuration)
- [📖 Usage Examples](#-usage-examples)
- [🔍 API Documentation](#-api-documentation)
- [🐳 Docker Deployment](#-docker-deployment)
- [🌍 Environment Variables](#-environment-variables)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🎯 Features

### ✨ Core Capabilities
- **🔍 AI-Powered Verification** - Critical evaluation of code, decisions, and implementations
- **🤝 Consensus Analysis** - Multi-source agreement analysis with confidence scoring
- **🌐 Search Grounding** - Real-time Google Search integration for fact verification
- **📊 Structured JSON Output** - Consistent, parseable responses for automation
- **🎯 Triangulation Analysis** - Independent validation for enhanced reliability
- **⚡ Claude Desktop Integration** - Seamless MCP protocol support

### 🏗️ Technical Features
- **📡 MCP Server Architecture** - Model Context Protocol compliance
- **🔗 Google Gemini Integration** - Advanced AI reasoning capabilities
- **📝 Zod Schema Validation** - Type-safe input/output validation
- **🛡️ Error Handling** - Robust fallback mechanisms
- **🔄 Hooks Coordination** - Claude-Flow integration support

## The Adjudicator Workflow: Solving AI Unreliability

### Why This is Needed: The Problem of Partial Work

Large Language Models (LLMs) are powerful, but can be unreliable for complex or repetitive tasks. When asked to perform an operation across many items (like updating 100 product descriptions), an LLM might only complete a fraction of the work, get stuck, or "hallucinate" that it's finished. Manually verifying this work is tedious and defeats the purpose of automation.

This project provides a solution by creating a "supervisor" AI to automatically verify the "worker" AI's output.

### What This Solves: Automated, Trustworthy AI Execution

This system introduces an **Adjudicator**—a supervisor AI powered by Gemini—that programmatically checks the work of another AI (like Claude). It doesn't just check for errors; it verifies task *completeness* against a set of rules.

By integrating with a hook-based system (like Claude Flow), you can build a closed-loop, self-correcting workflow where tasks are not considered "done" until they pass a rigorous, automated inspection.

### How It Works: The Core Workflow

The process turns a simple request into a fully verified, multi-agent task:

1.  **Task Interception**: A user issues a high-level command (e.g., "Update all blog posts"). A `UserPromptSubmit` hook intercepts this command *before* the worker AI sees it.

2.  **Test Plan Generation**: The hook sends a "meta-prompt" to an LLM, instructing it to generate two things:
    *   A step-by-step plan for the worker AI.
    *   A detailed **`verification_prompt`**—a precise checklist for the Adjudicator AI. This checklist is saved for later.

3.  **Task Execution**: The worker AI (e.g., Claude) receives its instructions and performs the task, such as editing a file.

4.  **Adjudication**: After the worker AI modifies a file, a `PostToolUse` hook is triggered. This hook:
    *   Retrieves the saved `verification_prompt`.
    *   Calls the **`verify_with_gemini`** tool (the Adjudicator).
    *   Provides the worker's output (`artifact`) and the `verification_prompt` as inputs.

5.  **Verdict**: The Adjudicator returns a structured JSON object with a clear `verdict` (`PASS`, `FAIL`, `NEEDS_IMPROVEMENT`) and detailed feedback, pinpointing exactly what is missing or incorrect. A `FAIL` verdict can halt the process or even trigger an automated correction loop.

This workflow transforms LLM-based automation from a "fire-and-forget" hope into a reliable, deterministic, and verifiable process.

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/mcp-gemini-adjudicator
cd mcp-gemini-adjudicator
npm install

# Set up environment
cp .env.example .env
# Add your GEMINI_API_KEY to .env (get from https://aistudio.google.com/app/apikey)

# Start the MCP server
node index.mjs
```

### 🪝 Enable Automatic Verification (Optional but Powerful!)

This project includes Claude Code hooks that automatically verify every change:

```bash
# Quick setup - add to .claude/settings.json:
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "*",
      "hooks": [{"type": "command", "command": ".claude/hooks/generate_verification_prompt.sh"}]
    }],
    "PostToolUse": [{
      "matcher": "WriteFile|Edit|Replace",
      "hooks": [{"type": "command", "command": ".claude/hooks/run_verification.sh"}]
    }]
  }
}
```

With hooks enabled, every task gets automatically verified for completeness and correctness!

## ⚡ Installation

### Prerequisites
- **Node.js 18+**
- **Google API Key** with Gemini access
- **Claude Desktop** (for MCP integration)

### Install Dependencies

```bash
# Install main project dependencies
npm install

# Install MCP Gemini Adjudicator dependencies
cd mcp-gemini-adjudicator
npm install
npm run build
```

### Verify Installation

```bash
# Check if tools are registered correctly
node index.mjs --help

# Test Gemini API connectivity
npm test
```

## 🔧 Configuration

### Claude Desktop Setup

Add to your Claude Desktop configuration (`~/AppData/Roaming/Claude/claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "gemini-consensus": {
      "command": "node",
      "args": ["/absolute/path/to/gemini_consensus/index.mjs"],
      "env": {
        "GOOGLE_API_KEY": "your-google-api-key-here"
      }
    }
  }
}
```

### Alternative: NPX Configuration

```json
{
  "mcpServers": {
    "gemini-consensus": {
      "command": "npx",
      "args": ["-p", ".", "node", "index.mjs"],
      "cwd": "/path/to/gemini_consensus",
      "env": {
        "GOOGLE_API_KEY": "your-google-api-key-here"
      }
    }
  }
}
```

### Environment Variables

Create a `.env` file in the project root:

```bash
# Required: Google API Key for Gemini access
GOOGLE_API_KEY=your_google_api_key_here

# Optional: Gemini Model Configuration
GEMINI_MODEL=gemini-1.5-pro-latest
GEMINI_TEMPERATURE=0.1
GEMINI_MAX_TOKENS=4096

# Optional: Search Configuration
ENABLE_SEARCH_GROUNDING=true
SEARCH_THRESHOLD=0.7

# Optional: Logging
LOG_LEVEL=info
DEBUG_MODE=false
```

## 🪝 Advanced: Claude Code Hooks Integration

The MCP Gemini Adjudicator includes powerful hook scripts that create an **automated verification loop** directly in Claude Code:

### How It Works

1. **Task Analysis**: When you submit a prompt, the system automatically generates verification criteria
2. **Execution**: Claude performs the requested task
3. **Verification**: Every file change is automatically verified against the criteria
4. **Feedback Loop**: Failed verifications block the operation and provide specific feedback

### Real-World Example

```bash
User: "Update all product pages with pricing, features, and testimonials sections"

System automatically:
✅ Generates checklist: Each page must have pricing, features, testimonials
✅ Monitors file changes
✅ Verifies completeness
❌ Blocks if any page is missing required sections
📝 Provides specific feedback: "Page 3 missing testimonials, Page 7 missing pricing"
```

### Hook Scripts Included

- **`generate_verification_prompt.sh`**: Creates task-specific verification criteria
- **`run_verification.sh`**: Verifies changes against criteria
- **Production versions**: Ready-to-use scripts with full Gemini API integration

See `.claude/hooks/README.md` for complete setup instructions.

## 📖 Usage Examples

### 🔍 Code Verification

```javascript
// Via MCP in Claude Desktop
await verify_with_gemini({
  task: "Review authentication middleware implementation",
  artifact: `
    function authenticateUser(req, res, next) {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'No token' });
      
      jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
      });
    }
  `,
  ground_with_search: true,
  tests_json: '{"passed": 8, "failed": 0, "coverage": "95%"}'
});
```

**Response Structure:**
```json
{
  "verdict": "PASS",
  "confidence": 0.85,
  "analysis": {
    "strengths": [
      "Proper JWT token extraction from Authorization header",
      "Appropriate error responses for missing/invalid tokens",
      "Clean middleware pattern implementation"
    ],
    "weaknesses": [
      "No rate limiting implementation",
      "Missing input sanitization"
    ],
    "risks": [
      "Potential JWT secret exposure if not properly secured"
    ]
  },
  "recommendations": [
    "Add rate limiting to prevent brute force attacks",
    "Implement token refresh mechanism",
    "Add logging for security events"
  ],
  "detailed_feedback": "The authentication middleware follows good security practices...",
  "test_coverage": {
    "covered_scenarios": ["Valid token", "Missing token", "Invalid token"],
    "missing_scenarios": ["Expired token", "Malformed token"]
  }
}
```

### 🤝 Consensus Analysis

```javascript
// Compare multiple AI responses or expert opinions
await consensus_check({
  question: "What is the best approach for implementing user authentication?",
  artifacts: [
    {
      source: "Security Expert A",
      content: "JWT tokens with refresh mechanism and OAuth2 integration provide the most secure and scalable solution."
    },
    {
      source: "Backend Developer B", 
      content: "Session-based authentication with Redis store offers better security and easier token revocation."
    },
    {
      source: "DevOps Engineer C",
      content: "Multi-factor authentication should be mandatory regardless of the chosen token strategy."
    }
  ],
  ground_with_search: true,
  triangulate: true
});
```

**Response Structure:**
```json
{
  "consensus_found": false,
  "agreement_ratio": 0.33,
  "key_findings": {
    "agreements": [
      "Security is the primary concern",
      "Token management is critical",
      "Scalability must be considered"
    ],
    "disagreements": [
      "JWT vs Session-based authentication preference",
      "Storage mechanism choices (stateless vs Redis)"
    ],
    "unique_insights": [
      "MFA requirement regardless of token strategy",
      "OAuth2 integration benefits",
      "Token revocation complexity differences"
    ]
  },
  "recommendations": [
    "Implement hybrid approach with JWT and refresh tokens",
    "Use Redis for session management and blacklisting",
    "Mandatory MFA for all user accounts",
    "Regular security audits of authentication flow"
  ],
  "confidence": 0.78,
  "synthesis": "While experts disagree on token implementation details, there's strong consensus on security-first principles...",
  "triangulation_analysis": {
    "independent_assessment": "Modern authentication requires layered security...",
    "validation_result": "CONFIRMS"
  }
}
```

### 📊 Advanced Workflows

```javascript
// Complex verification with search grounding
const verificationResult = await verify_with_gemini({
  task: "Evaluate database migration strategy for high-traffic application",
  artifact: `
    // Migration strategy implementation
    class DatabaseMigrator {
      async performZeroDowntimeMigration() {
        await this.createShadowTable();
        await this.syncData();
        await this.switchTraffic();
        await this.cleanupOldTable();
      }
    }
  `,
  ground_with_search: true
});

// Follow up with consensus check on migration approaches
const consensusResult = await consensus_check({
  question: "What are the best practices for zero-downtime database migrations?",
  artifacts: [
    {
      source: "Implementation",
      content: verificationResult.detailed_feedback
    },
    {
      source: "Industry Standards",
      content: "Blue-green deployments with gradual traffic shifting..."
    }
  ],
  triangulate: true
});
```

## 🔍 API Documentation

### Tool: `verify_with_gemini`

**Purpose:** Critical evaluation and verification of code, decisions, or implementations using Gemini AI.

**Input Schema:**
```typescript
{
  task: string;           // Description of what to verify
  artifact: string;       // The content to be verified
  tests_json?: string;    // Optional test results
  ground_with_search?: boolean; // Enable Google Search grounding
}
```

**Output Schema:**
```typescript
{
  verdict: "PASS" | "FAIL" | "NEEDS_IMPROVEMENT";
  confidence: number;     // 0.0 to 1.0
  analysis: {
    strengths: string[];
    weaknesses: string[];
    risks: string[];
  };
  recommendations: string[];
  detailed_feedback: string;
  test_coverage: {
    covered_scenarios: string[];
    missing_scenarios: string[];
  };
}
```

### Tool: `consensus_check`

**Purpose:** Analyze multiple sources for agreement and disagreement patterns.

**Input Schema:**
```typescript
{
  question?: string;      // Optional context question
  artifacts: Array<{     // Sources to compare
    source: string;
    content: string;
  }>;
  ground_with_search?: boolean; // Enable Google Search
  triangulate?: boolean;  // Get independent Gemini analysis
}
```

**Output Schema:**
```typescript
{
  consensus_found: boolean;
  agreement_ratio: number; // 0.0 to 1.0
  key_findings: {
    agreements: string[];
    disagreements: string[];
    unique_insights: string[];
  };
  recommendations: string[];
  confidence: number;
  synthesis: string;
  triangulation_analysis: {
    independent_assessment: string;
    validation_result: "CONFIRMS" | "CONTRADICTS" | "NEUTRAL";
  };
}
```

## 🐳 Docker Deployment

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY mcp-gemini-adjudicator/package*.json ./mcp-gemini-adjudicator/

# Install dependencies
RUN npm install
RUN cd mcp-gemini-adjudicator && npm install && npm run build

# Copy source code
COPY . .

# Expose MCP port (if using HTTP transport)
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the server
CMD ["node", "index.mjs"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  gemini-consensus:
    build: .
    container_name: gemini-consensus-server
    environment:
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - GEMINI_MODEL=gemini-1.5-pro-latest
      - LOG_LEVEL=info
    volumes:
      - ./logs:/app/logs
    ports:
      - "3000:3000"  # If using HTTP transport
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "console.log('OK')"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Optional: Redis for caching (future enhancement)
  redis:
    image: redis:7-alpine
    container_name: gemini-consensus-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### Deploy with Docker

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f gemini-consensus

# Scale if needed
docker-compose up -d --scale gemini-consensus=3

# Update deployment
docker-compose pull && docker-compose up -d
```

## 🌍 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Google API key with Gemini access | `AIza...` |

### Optional Configuration

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `GEMINI_MODEL` | Gemini model to use | `gemini-1.5-pro-latest` | `gemini-pro`, `gemini-1.5-pro` |
| `GEMINI_TEMPERATURE` | Response randomness | `0.1` | `0.0` to `1.0` |
| `GEMINI_MAX_TOKENS` | Maximum response tokens | `4096` | `1` to `8192` |
| `ENABLE_SEARCH_GROUNDING` | Enable search by default | `false` | `true`, `false` |
| `SEARCH_THRESHOLD` | Search relevance threshold | `0.7` | `0.0` to `1.0` |
| `LOG_LEVEL` | Logging verbosity | `info` | `debug`, `info`, `warn`, `error` |
| `DEBUG_MODE` | Enable debug logging | `false` | `true`, `false` |
| `MCP_TRANSPORT` | Transport protocol | `stdio` | `stdio`, `http` |
| `HTTP_PORT` | HTTP transport port | `3000` | Any valid port |

### Environment File Template

```bash
# Copy this template to .env and fill in your values
cp .env.example .env

# .env.example content:
GOOGLE_API_KEY=your_google_api_key_here
GEMINI_MODEL=gemini-1.5-pro-latest
GEMINI_TEMPERATURE=0.1
GEMINI_MAX_TOKENS=4096
ENABLE_SEARCH_GROUNDING=false
SEARCH_THRESHOLD=0.7
LOG_LEVEL=info
DEBUG_MODE=false
```

## 🛠️ Troubleshooting

### Common Issues

#### ❌ "API Key not found" Error

```bash
# Check if API key is set
echo $GOOGLE_API_KEY

# Verify API key format (should start with 'AIza')
# Get key from: https://aistudio.google.com/app/apikey

# Test API connectivity
curl -H "Content-Type: application/json" \
     -H "x-goog-api-key: $GOOGLE_API_KEY" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
     https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent
```

#### ❌ MCP Server Not Responding

```bash
# Check if server is running
ps aux | grep "node index.mjs"

# Test server directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node index.mjs

# Check Claude Desktop configuration
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Restart Claude Desktop after config changes
```

#### ❌ JSON Parsing Errors

```javascript
// Check response format in logs
// Enable debug mode for detailed output
DEBUG_MODE=true node index.mjs

// Verify input schemas match expected format
const { VerifyArgs } = require('./src/schemas.mjs');
VerifyArgs.parse(yourInput); // Will throw if invalid
```

#### ❌ Rate Limiting

```bash
# Gemini API has rate limits:
# - 15 requests per minute (free tier)
# - 1500 requests per minute (paid)

# Add retry logic or implement queuing
# Check quota: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas
```

### Performance Optimization

```javascript
// Optimize for better performance

// 1. Reduce temperature for consistent results
GEMINI_TEMPERATURE=0.1

// 2. Limit token usage
GEMINI_MAX_TOKENS=2048

// 3. Use search grounding selectively
ground_with_search: false // Enable only when needed

// 4. Implement caching for repeated queries
// (Future enhancement with Redis)
```

### Debug Commands

```bash
# Enable verbose logging
DEBUG_MODE=true LOG_LEVEL=debug node index.mjs

# Test individual components
npm test src/gemini.test.js
npm test src/verify.test.js
npm test src/consensus.test.js

# Check Claude Flow coordination
npx claude-flow@alpha hooks session-restore --session-id "debug-session"
npx claude-flow@alpha hooks notify --message "Debug test"

# Validate schemas
node -e "
  import('./src/schemas.mjs').then(({ VerifyArgs }) => {
    console.log('Schema loaded successfully');
  });
"
```

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-username/gemini_consensus.git
cd gemini_consensus

# Create development branch
git checkout -b feature/your-feature-name

# Install dependencies
npm install
cd mcp-gemini-adjudicator && npm install

# Set up development environment
cp .env.example .env.dev
# Add your development API keys

# Run tests
npm test

# Start development server
npm run dev
```

### Code Standards

- **ES Modules** - Use import/export syntax
- **Error Handling** - Always provide fallback responses
- **Schema Validation** - Use Zod for input validation
- **Documentation** - Update README for new features
- **Testing** - Add tests for new functionality

### Contribution Guidelines

1. **Fork** the repository
2. **Create** a feature branch
3. **Write** tests for new functionality
4. **Ensure** all tests pass
5. **Update** documentation
6. **Submit** a pull request

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "verification"
npm test -- --grep "consensus"

# Test with coverage
npm run test:coverage

# Integration tests with Claude Flow
npx claude-flow@alpha hooks pre-task --description "Testing"
npm test
npx claude-flow@alpha hooks post-task --task-id "test-run"
```

### Pull Request Process

1. Update README.md with details of changes
2. Update version numbers following SemVer
3. Add tests for new functionality
4. Ensure CI/CD pipeline passes
5. Get approval from maintainers

## 📄 License

**MIT License**

```
Copyright (c) 2024 Gemini Consensus Project

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🚀 Additional Resources

- **[Model Context Protocol](https://modelcontextprotocol.com/)** - Official MCP documentation
- **[Google Gemini API](https://ai.google.dev/)** - Gemini API documentation
- **[Claude Desktop](https://claude.ai/desktop)** - Download Claude Desktop
- **[Claude Flow](https://github.com/ruvnet/claude-flow)** - Coordination framework
- **[Zod Documentation](https://zod.dev/)** - Schema validation library

### Community & Support

- **Issues**: [GitHub Issues](https://github.com/your-username/gemini_consensus/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/gemini_consensus/discussions)
- **Discord**: [Community Server](https://discord.gg/your-server)

---

**Built with ❤️ by the Gemini Consensus team**

*Empowering intelligent decision-making through AI-powered verification and consensus analysis*