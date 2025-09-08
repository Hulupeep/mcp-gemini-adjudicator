import { ConsensusArgs } from './schemas.mjs';
import { getGemini } from './gemini.mjs';

/**
 * Register the consensus_check tool with the MCP server
 * @param {Object} server - MCP server instance
 */
export async function registerConsensusTool(server) {
  server.registerTool(
    'consensus_check',
    'Compare multiple model answers and return a structured consensus analysis with agreements, conflicts, gaps, and recommendations. Optionally triangulate by asking Gemini to produce its own answer.',
    {
      question: {
        type: 'string',
        description: 'Prompt or task under debate'
      },
      artifacts: {
        type: 'array',
        description: 'At least two model answers to compare',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source model name' },
            content: { type: 'string', description: 'Model answer content' }
          },
          required: ['source', 'content']
        },
        minItems: 2
      },
      triangulate: {
        type: 'boolean',
        default: false,
        description: 'Ask Gemini to produce its own answer and include it'
      },
      ground_with_search: {
        type: 'boolean',
        default: false,
        description: 'Use Google Search for grounding'
      }
    },
    async (args) => {
      // Validate arguments using Zod schema
      const validatedArgs = ConsensusArgs.parse(args);
      
      const { question, artifacts, triangulate, ground_with_search } = validatedArgs;
      
      try {
        const { model, modelId } = getGemini();
        
        // Define the strict JSON schema for consensus response
        const consensusPrompt = `You are a consensus analyzer comparing multiple AI model responses.
        
Output ONLY valid JSON following this exact schema:
{
  "consensus": "agree" | "partial" | "disagree",
  "agreement_ratio": number (0.0-1.0),
  "summary": string,
  "findings": [{
    "type": "agreement" | "conflict" | "gap",
    "message": string,
    "severity": "low" | "med" | "high"
  }],
  "recommended_action": "accept" | "revise" | "escalate",
  "model_votes": [{
    "source": string,
    "confidence": number (0.0-1.0),
    "notes": string
  }],
  "citations": [{ "url": string, "title": string }],
  "gemini_answer": string (only if triangulate is true)
}

Analyze the provided artifacts for:
- Common agreements and consensus points
- Critical disagreements or conflicts
- Gaps or missing information
- Overall confidence in the consensus`;

        // Format artifacts for analysis
        const sourcesBlock = artifacts
          .map((a, i) => `SOURCE_${i + 1} (${a.source}):\n${a.content}`)
          .join('\n\n---\n\n');

        // Build the prompt parts
        const parts = [
          { text: consensusPrompt },
          { text: `\nQUESTION: ${question || '(not provided)'}` },
          { text: `\nARTIFACTS TO COMPARE:\n${sourcesBlock.slice(0, 160000)}` },
          { text: `\nTRIANGULATE: ${triangulate}` }
        ];
        
        // Configure generation
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
        
        // Generate consensus analysis
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
            consensus: 'partial',
            agreement_ratio: 0.5,
            summary: 'Unable to parse consensus response properly',
            findings: [
              {
                type: 'gap',
                message: 'Response parsing failed, manual review needed',
                severity: 'med'
              }
            ],
            recommended_action: 'revise',
            model_votes: artifacts.map(a => ({
              source: a.source,
              confidence: 0.5,
              notes: 'Unable to determine due to parsing error'
            })),
            citations: []
          };
        }
        
        // If triangulate requested, get Gemini's own answer
        if (triangulate && question) {
          try {
            const triangulationResult = await model.generateContent({
              contents: [{
                role: 'user',
                parts: [{
                  text: `Provide your own concise answer (max 250 words) to this question:\n\n${question}`
                }]
              }],
              generationConfig: {
                temperature: 0.5,
                topP: 0.95,
                maxOutputTokens: 1024,
              }
            });
            
            const geminiAnswer = triangulationResult.response.text();
            jsonResponse.gemini_answer = geminiAnswer.slice(0, 2000);
          } catch (triError) {
            jsonResponse.gemini_answer = `Error getting Gemini answer: ${triError.message}`;
          }
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
        console.error('Error in consensus_check:', error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                consensus: 'partial',
                agreement_ratio: 0,
                summary: `Error during consensus analysis: ${error.message}`,
                findings: [
                  {
                    type: 'gap',
                    message: 'Consensus analysis failed',
                    severity: 'high'
                  }
                ],
                recommended_action: 'escalate',
                model_votes: artifacts.map(a => ({
                  source: a.source,
                  confidence: 0,
                  notes: 'Error during analysis'
                })),
                citations: []
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}