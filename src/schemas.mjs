import { z } from 'zod';

/**
 * Schema for verify tool arguments
 * Validates artifact verification requests with different task types
 */
export const VerifyArgs = z.object({
  artifact: z.string()
    .min(1, 'Artifact text cannot be empty')
    .describe('Text content to be verified or checked'),
  
  task: z.enum(['fact_check', 'code_review', 'test_report_review', 'policy'])
    .default('fact_check')
    .describe('Type of verification task to perform'),
  
  tests_json: z.string()
    .optional()
    .describe('Optional JSON string containing test results for test report reviews'),
  
  ground_with_search: z.boolean()
    .default(false)
    .describe('Whether to ground verification with web search for additional context')
});

/**
 * Schema for consensus tool arguments
 * Validates consensus building requests across multiple artifacts
 */
export const ConsensusArgs = z.object({
  question: z.string()
    .optional()
    .describe('Optional prompt or question to guide the consensus process'),
  
  artifacts: z.array(
    z.object({
      source: z.string()
        .min(1, 'Artifact source cannot be empty')
        .describe('Source identifier or name for the artifact'),
      
      content: z.string()
        .min(1, 'Artifact content cannot be empty')
        .describe('The actual content/text of the artifact')
    })
  )
    .min(2, 'At least 2 artifacts are required for consensus building')
    .describe('Array of artifacts to build consensus from'),
  
  triangulate: z.boolean()
    .default(false)
    .describe('Whether to use triangulation method for consensus validation'),
  
  ground_with_search: z.boolean()
    .default(false)
    .describe('Whether to ground consensus with web search for additional validation')
});

// Note: For TypeScript usage, you can infer types with:
// type VerifyArgsType = z.infer<typeof VerifyArgs>;
// type ConsensusArgsType = z.infer<typeof ConsensusArgs>;