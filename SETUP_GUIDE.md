# 🚀 Gemini Adjudicator MCP Setup Guide

## ✅ Installation Complete!

The Gemini Adjudicator MCP server has been successfully installed and is ready for configuration.

## 📋 Next Steps

### 1. Get Your Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Get API Key" or "Create API Key"
4. Copy your API key

### 2. Configure Your API Key

Edit the `.env` file in `/home/xanacan/Dropbox/code/mcp-gemini-adjudicator/.env`:

```bash
# Option 1: Using a text editor
nano /home/xanacan/Dropbox/code/mcp-gemini-adjudicator/.env
# Replace YOUR_GEMINI_API_KEY_HERE with your actual API key

# Option 2: Using sed (replace YOUR_ACTUAL_KEY with your key)
sed -i 's/YOUR_GEMINI_API_KEY_HERE/YOUR_ACTUAL_KEY/' /home/xanacan/Dropbox/code/mcp-gemini-adjudicator/.env
```

### 3. Start the MCP Server

```bash
cd /home/xanacan/Dropbox/code/mcp-gemini-adjudicator
npm start
```

### 4. Add to Claude Desktop (Optional)

To use with Claude Desktop, add this to your Claude configuration:

```json
{
  "mcpServers": {
    "gemini-adjudicator": {
      "command": "node",
      "args": ["/home/xanacan/Dropbox/code/mcp-gemini-adjudicator/index.mjs"],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

## 🎯 What This Does

The Gemini Adjudicator provides:

1. **AI Verification** - Automatically verifies AI-generated content and code
2. **Consensus Analysis** - Multiple AI agents reach agreement on decisions
3. **Quality Control** - Ensures AI work meets specified criteria
4. **Automated Testing** - Validates completeness of AI tasks

## 🔧 Key Features for FloutLabs

This tool is perfect for FloutLabs' AI automation services:

- **Verify Blog Content**: Ensure all 20 blog stories meet the 400-word requirement
- **Code Quality Checks**: Validate that AI-generated code follows best practices
- **Task Completion**: Confirm AI agents complete all assigned work
- **Consensus Building**: Multiple AI perspectives on business automation solutions

## 📊 Example Use Cases

### 1. Blog Story Verification
```javascript
// Verify a blog story meets requirements
verify_with_gemini({
  artifact: "blog story content...",
  verification_prompt: "Check: 1) Word count >= 400, 2) Has cost breakdown, 3) Has 3-step workflow",
  context: "Blog story for Irish SME audience"
})
```

### 2. Code Review
```javascript
// Verify code changes are complete
verify_with_gemini({
  artifact: "modified code...",
  verification_prompt: "Verify: 1) All functions documented, 2) Error handling added, 3) Tests included",
  context: "FloutLabs website enhancement"
})
```

### 3. Task Completion Check
```javascript
// Verify all tasks were completed
build_consensus({
  question: "Have all 8 industry cards been properly updated with Read Story buttons?",
  sources: ["index.html content", "navigation test results"],
  context: "Website audit"
})
```

## 🛠️ Troubleshooting

### Common Issues:

1. **API Key Error**: Ensure your Gemini API key is valid and has proper permissions
2. **Rate Limiting**: The free tier has limits; consider upgrading for production use
3. **Connection Issues**: Check your internet connection and firewall settings

### Test Your Setup:

```bash
# Test the server is running
cd /home/xanacan/Dropbox/code/mcp-gemini-adjudicator
npm test

# Check logs
tail -f /home/xanacan/Dropbox/code/mcp-gemini-adjudicator/logs/mcp-server.log
```

## 🔗 Integration with FloutLabs

This adjudicator can help ensure quality across your FloutLabs projects:

1. **Content Quality**: Verify all blog stories meet professional standards
2. **Code Validation**: Ensure AI-generated code is production-ready
3. **Task Verification**: Confirm all website features are properly implemented
4. **Consensus Building**: Get multiple AI opinions on business automation strategies

## 📚 Resources

- [Gemini API Documentation](https://ai.google.dev/docs)
- [MCP Protocol Specification](https://modelcontextprotocol.com/)
- [Project Repository](https://github.com/Hulupeep/mcp-gemini-adjudicator)

## 🎉 Ready to Use!

Once you've added your API key, the Gemini Adjudicator will be ready to:
- Verify AI work quality
- Build consensus on decisions
- Ensure task completion
- Provide automated quality control

This tool will help FloutLabs deliver higher quality AI automation solutions with built-in verification and quality assurance!