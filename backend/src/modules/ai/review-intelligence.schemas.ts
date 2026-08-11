import { z } from 'zod';

export const REVIEW_INTELLIGENCE_PROMPT_VERSION = 'review-intelligence.v1';

const boundedText = z.string().trim().min(1).max(1000);

export const reviewAspectSchema = z.object({
  aspect: z.string().trim().min(1).max(80),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED']),
  confidence: z.number().min(0).max(1),
  evidence: z.string().trim().max(1000).default(''),
}).strict();

export const reviewIntelligenceOutputSchema = z.object({
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED']),
  aspects: z.array(reviewAspectSchema).max(24).default([]),
  operationalUrgency: z.number().int().min(0).max(100),
  reputationRisk: z.number().int().min(0).max(100),
  churnRisk: z.number().int().min(0).max(100).nullable().default(null),
  churnRiskConfidence: z.number().min(0).max(1).nullable().default(null),
  churnRiskInsufficientEvidence: z.boolean().default(false),
  legalPrRisk: z.boolean(),
  legalPrRiskReason: z.string().trim().max(2000).nullable().default(null),
  safetyRisk: z.boolean(),
  safetyRiskReason: z.string().trim().max(2000).nullable().default(null),
  spamSignalProbability: z.number().min(0).max(1).nullable().default(null),
  coordinatedSignalProbability: z.number().min(0).max(1).nullable().default(null),
  signalReasons: z.array(boundedText).max(12).default([]),
  rootCauseHypothesis: z.string().trim().max(3000).nullable().default(null),
  observedFacts: z.array(boundedText).max(16).default([]),
  inferences: z.array(boundedText).max(16).default([]),
  recommendations: z.array(boundedText).max(16).default([]),
  confidence: z.number().min(0).max(1),
}).strict();

export type ReviewIntelligenceOutput = z.infer<typeof reviewIntelligenceOutputSchema>;

export const reviewIdParamsSchema = z.object({ reviewId: z.string().uuid() });
