import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Create Gemini client factory
 * @returns {Object} Object containing { ai, model, modelId }
 * @throws {Error} If GEMINI_API_KEY is not set
 */
export function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const modelId = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
  
  const ai = new GoogleGenerativeAI(apiKey);
  const model = ai.getGenerativeModel({ model: modelId });
  
  return {
    ai,
    model,
    modelId
  };
}