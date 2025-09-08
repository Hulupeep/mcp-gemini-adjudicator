#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerVerifyTool } from "./src/verify.mjs";
import { registerConsensusTool } from "./src/consensus.mjs";

/**
 * MCP Gemini Adjudicator Server
 * 
 * This MCP server provides AI-powered verification and consensus tools using
 * Google Gemini models to validate information and facilitate decision-making
 */

// Create MCP server instance
const server = new McpServer({
  name: "mcp-gemini-adjudicator",
  version: "0.1.0",
});

/**
 * Initialize and start the MCP server
 */
async function main() {
  try {
    // Register tools
    await registerVerifyTool(server);
    await registerConsensusTool(server);
    
    console.error("✅ Tools registered successfully");
    
    // Create and connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("🚀 MCP Gemini Adjudicator server started");
    console.error("📡 Listening on stdio transport");
  } catch (error) {
    console.error("💥 Failed to start server:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error("\n🔄 Shutting down gracefully...");
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error("🔄 Shutting down gracefully...");
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("💥 Unhandled error:", error);
  process.exit(1);
});