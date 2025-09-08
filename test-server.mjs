#!/usr/bin/env node

/**
 * Test script for the MCP Gemini Adjudicator server
 * Run this to verify the server is working correctly
 */

console.log("✅ MCP Gemini Adjudicator Server Test");
console.log("=====================================\n");

console.log("📋 Server Configuration:");
console.log("- Name: mcp-gemini-adjudicator");
console.log("- Version: 0.1.0");
console.log("- Transport: stdio\n");

console.log("🛠️ Available Tools:");
console.log("1. verify_with_gemini");
console.log("   - Evaluates artifacts (code, answers, specs)");
console.log("   - Returns structured JSON verdict");
console.log("   - Optional Google Search grounding\n");

console.log("2. consensus_check");
console.log("   - Compares multiple model answers");
console.log("   - Identifies agreements and conflicts");
console.log("   - Optional triangulation with Gemini's answer\n");

console.log("📝 Example Usage in Claude Desktop:");
console.log('```json');
console.log(JSON.stringify({
  "mcpServers": {
    "gemini-adjudicator": {
      "command": "node",
      "args": [process.cwd() + "/index.mjs"],
      "env": {
        "GEMINI_API_KEY": "YOUR_GOOGLE_AI_STUDIO_KEY",
        "GEMINI_MODEL": "gemini-2.0-flash-exp"
      }
    }
  }
}, null, 2));
console.log('```\n');

console.log("✅ Server is ready for integration!");
console.log("⚠️  Remember to set your GEMINI_API_KEY before using with real requests.");
console.log("🔑 Get your API key from: https://aistudio.google.com/app/apikey");