#!/bin/bash
# Start Gemini Adjudicator MCP Server

echo "🚀 Starting Gemini Adjudicator MCP Server..."

# Load environment variables
export $(cat /home/xanacan/Dropbox/code/mcp-gemini-adjudicator/.env | xargs)

# Start the server
cd /home/xanacan/Dropbox/code/mcp-gemini-adjudicator
node index.mjs