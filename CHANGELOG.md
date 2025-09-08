# Changelog

All notable changes to MCP Gemini Adjudicator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-09

### 🎉 Initial Release

#### Added
- **MCP Server** - Full Model Context Protocol server implementation
- **verify_with_gemini Tool** - Critical evaluation of code, answers, and documents
  - Structured JSON responses with confidence scoring
  - Optional Google Search grounding for fact-checking
  - Support for multiple task types (fact_check, code_review, test_report_review, policy)
- **consensus_check Tool** - Multi-source answer comparison and consensus analysis
  - Agreement ratio calculation
  - Conflict and gap identification
  - Optional triangulation with Gemini's independent assessment
- **Gemini AI Integration** - Google Generative AI client with proper error handling
- **Input Validation** - Zod schemas for reliable data validation
- **Docker Support** - Production-ready containerization with security hardening
- **Comprehensive Documentation** - User-friendly setup guides and examples

#### Security
- Environment variable configuration for API keys
- Input sanitization and validation
- Error handling without information leakage
- Security-hardened Docker configuration

#### Developer Experience
- TypeScript-compatible schemas
- Comprehensive error handling and fallbacks
- Example configurations for Claude Desktop
- Detailed troubleshooting guides

### 🔒 Security Notes
- All sensitive configuration properly externalized
- No API keys or secrets in codebase
- Secure defaults for all configurations

---

## Development

### Unreleased Changes
*No unreleased changes yet*

### Future Roadmap
- Additional AI model integrations (OpenAI, Claude, etc.)
- Enhanced search capabilities
- Batch processing support
- Advanced consensus algorithms
- Performance optimizations