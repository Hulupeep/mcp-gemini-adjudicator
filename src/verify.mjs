import { VerifyArgs } from './schemas.mjs';
import { getGemini } from './gemini.mjs';

/**
 * Register the verify_with_gemini tool with the MCP server
 * @param {Object} server - MCP server instance
 */
export async function registerVerifyTool(server) {
  server.registerTool(
    'verify_with_gemini',
    'Critical evaluation of code, decisions, or implementations using Gemini API. Returns structured JSON verdict with detailed analysis, recommendations, and confidence scoring.',
    {
      artifact: {
        type: 'string',
        description: 'Text to check (answer, code, spec, etc.)',
        required: true
      },
      task: {
        type: 'string',
        enum: ['fact_check', 'code_review', 'test_report_review', 'policy'],
        default: 'fact_check',
        description: 'Type of verification task'
      },
      tests_json: {
        type: 'string',
        description: 'Optional JSON test results or metadata'
      },
      ground_with_search: {
        type: 'boolean',
        default: false,
        description: 'Use Google Search for grounding'
      }
    },
    async (args) => {
      // Validate arguments using Zod schema
      const validatedArgs = VerifyArgs.parse(args);
      
      const { artifact, task, tests_json, ground_with_search } = validatedArgs;
      
      try {
        const { model, modelId } = getGemini();
        
        // Define the strict JSON schema for Gemini response
        const systemPrompt = `You are a critical evaluator performing ${task} analysis.
        
Output ONLY valid JSON following this exact schema:
{
  "verdict": "PASS" | "FAIL" | "NEEDS_IMPROVEMENT",
  "confidence": number (0.0-1.0),
  "analysis": {
    "strengths": string[],
    "weaknesses": string[],
    "risks": string[]
  },
  "recommendations": string[],
  "detailed_feedback": string,
  "test_coverage": {
    "scenarios_checked": string[],
    "scenarios_missing": string[]
  },
  "citations": [{ "url": string, "title": string }] (only if ground_with_search is true)
}

Be thorough, critical, and objective. Focus on:
- Correctness and accuracy
- Security implications
- Performance considerations
- Edge cases and error handling
- Best practices and standards`;

        // Build the prompt parts
        const parts = [
          { text: systemPrompt },
          { text: `\nTASK: ${task}` },
          { text: `\nARTIFACT TO VERIFY:\n${artifact.slice(0, 120000)}` }
        ];
        
        if (tests_json) {
          parts.push({ text: `\nTEST RESULTS/METADATA:\n${tests_json.slice(0, 80000)}` });
        }
        
        // Configure generation with optional search grounding
        const generationConfig = {
          temperature: 0.3,
          topP: 0.95,
          topK: 20,
          maxOutputTokens: 8192,
        };
        
        // Add Google Search if requested
        const toolConfig = ground_with_search ? {
          functionCallingConfig: {
            mode: 'AUTO',
            allowedFunctionNames: ['google_search']
          }
        } : undefined;
        
        // Generate content with Gemini
        const result = await model.generateContent({
          contents: [{ role: 'user', parts }],
          generationConfig,
          tools: ground_with_search ? [{ googleSearchRetrieval: {} }] : undefined,
          toolConfig
        });
        
        const response = result.response;
        const text = response.text();
        
        // Parse JSON response
        let jsonResponse;
        try {
          jsonResponse = JSON.parse(text);
        } catch (parseError) {
          // Fallback response if JSON parsing fails
          jsonResponse = {
            verdict: 'NEEDS_IMPROVEMENT',
            confidence: 0.5,
            analysis: {
              strengths: [],
              weaknesses: ['Response parsing failed'],
              risks: ['Incomplete analysis due to parsing error']
            },
            recommendations: ['Retry verification with clearer inputs'],
            detailed_feedback: `Raw response: ${text.slice(0, 1000)}`,
            test_coverage: {
              scenarios_checked: [],
              scenarios_missing: ['Unable to determine due to parsing error']
            },
            citations: []
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(jsonResponse, null, 2)
            }
          ]
        };
        
      } catch (error) {
        console.error('Error in verify_with_gemini:', error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                verdict: 'NEEDS_IMPROVEMENT',
                confidence: 0,
                analysis: {
                  strengths: [],
                  weaknesses: ['Verification failed'],
                  risks: ['Error during verification process']
                },
                recommendations: ['Check API configuration and retry'],
                detailed_feedback: `Error: ${error.message}`,
                test_coverage: {
                  scenarios_checked: [],
                  scenarios_missing: ['All scenarios due to error']
                },
                citations: []
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}