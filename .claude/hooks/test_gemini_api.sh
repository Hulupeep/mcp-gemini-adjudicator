#!/bin/bash
# Test script to verify Gemini API is working

set -e

# Load environment
ENV_FILE="/home/xanacan/Dropbox/code/gemini_consensus/.env"
if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^GEMINI_API_KEY=" "$ENV_FILE" | xargs)
fi

if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" == "your_gemini_api_key_here" ]; then
    echo "❌ GEMINI_API_KEY not configured in .env file"
    echo "Please add your API key to the .env file first"
    exit 1
fi

echo "Testing Gemini API connection..."

# Simple test request
response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{
      "contents": [{
        "parts": [{
          "text": "Respond with a simple JSON: {\"status\": \"working\", \"message\": \"API connection successful\"}"
        }]
      }],
      "generationConfig": {
        "temperature": 0.1,
        "maxOutputTokens": 100,
        "responseMimeType": "application/json"
      }
    }' \
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-exp:generateContent?key=$GEMINI_API_KEY")

# Check if we got a response
if [ -z "$response" ]; then
    echo "❌ No response from Gemini API"
    exit 1
fi

# Check for error in response
if echo "$response" | grep -q '"error"'; then
    echo "❌ API Error:"
    echo "$response" | jq '.error'
    exit 1
fi

# Extract the text from response
result=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text' 2>/dev/null)

if [ ! -z "$result" ]; then
    echo "✅ Gemini API is working!"
    echo "Response: $result"
else
    echo "❌ Could not parse Gemini response"
    echo "Raw response: $response"
    exit 1
fi