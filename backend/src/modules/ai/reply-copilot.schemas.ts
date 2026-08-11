import { z } from 'zod';

export const AI_REPLY_PROMPT_VERSION = 'review-reply.v1';
export const REPLY_POLICY_VERSION = 'reply-policy.v1';

export const replyGenerationModeSchema = z.enum(['CONCISE', 'EMPATHETIC', 'FORMAL', 'RECOVERY_FOCUSED']);
export type ReplyGenerationMode = z.infer<typeof replyGenerationModeSchema>;

export const brandVoiceSchema = z.object({
  tone: z.enum(['PROFESSIONAL', 'FRIENDLY', 'PREMIUM', 'NEUTRAL', 'EMPATHETIC', 'CUSTOM']).default('PROFESSIONAL'),
  formality: z.enum(['FORMAL', 'BALANCED', 'CASUAL']).default('BALANCED'),
  primaryLanguage: z.string().trim().min(2).max(16).default('ru'),
  responseLength: z.enum(['SHORT', 'MEDIUM', 'DETAILED']).default('MEDIUM'),
  greetingStyle: z.string().trim().max(240).default(''),
  signature: z.string().trim().max(240).default(''),
  preferredPhrases: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
  prohibitedPhrases: z.array(z.string().trim().min(1).max(240)).max(50).default([]),
  legalDisclaimer: z.string().trim().max(1000).default(''),
  compensationPolicy: z.enum(['FORBID', 'REQUIRE_APPROVAL', 'ALLOW']).default('REQUIRE_APPROVAL'),
  escalationTriggers: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
  customInstructions: z.string().trim().max(4000).default(''),
}).strict();

export const updateBrandVoiceSchema = brandVoiceSchema.partial();

export const replyAutopilotSchema = z.object({
  enabled: z.boolean().default(false),
  minimumRating: z.number().int().min(1).max(5).default(4),
  maximumReputationRisk: z.number().int().min(0).max(100).default(20),
  minimumAiConfidence: z.number().min(0).max(1).default(0.95),
}).strict();

export const updateReplyAutopilotSchema = replyAutopilotSchema.partial();

export const generateReplyBodySchema = z.object({
  mode: replyGenerationModeSchema.default('EMPATHETIC'),
  instructions: z.string().trim().max(1200).default(''),
}).strict();

export const aiReplyOutputSchema = z.object({
  reply: z.string().trim().min(1).max(4000),
  language: z.string().trim().min(2).max(16),
  tone: z.string().trim().min(1).max(80),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
}).strict();

export type AiReplyOutput = z.infer<typeof aiReplyOutputSchema>;

export const reviewOperationParamsSchema = z.object({
  reviewId: z.string().uuid(),
  operationId: z.string().uuid(),
});
