import { z } from 'zod';

export const ASK_SHIELD_PROMPT_VERSION = 'p25-ask-shield-v1';

export const askShieldQuestionSchema = z.object({
  question: z.string().trim().min(3).max(2000),
});

export const askShieldHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().uuid().optional(),
});

export const askShieldQueryIdParamsSchema = z.object({ queryId: z.string().uuid() });

export const askShieldEvidenceSchema = z.object({
  type: z.enum(['review', 'aggregate', 'case', 'task', 'ai_visibility', 'listing_health', 'competitive']),
  id: z.string().nullable(),
  label: z.string().min(1).max(240),
  route: z.string().max(500).nullable(),
  summary: z.string().max(1000).nullable(),
});

export const askShieldProviderOutputSchema = z.object({
  answer: z.string().trim().min(1).max(12000),
  evidenceIndexes: z.array(z.number().int().min(0)).max(30),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  limitations: z.array(z.string().trim().min(1).max(500)).max(12),
});

export type AskShieldEvidence = z.infer<typeof askShieldEvidenceSchema>;
export type AskShieldProviderOutput = z.infer<typeof askShieldProviderOutputSchema>;
