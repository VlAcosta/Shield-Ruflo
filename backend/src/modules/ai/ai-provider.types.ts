import type { ReviewIntelligenceOutput } from './review-intelligence.schemas.js';
import type { AiReplyOutput, ReplyGenerationMode } from './reply-copilot.schemas.js';

export type AiProviderAvailability = {
  configured: boolean;
  available: boolean;
  reasonCode?: string;
  reasonMessage?: string;
};

export type AnalyzeReviewInput = {
  organizationId: string;
  reviewId: string;
  rating: number;
  text: string;
  language: string | null;
  provider: string;
  businessName: string;
  locationName: string | null;
};

export type AnalyzeReviewResult = {
  output: ReviewIntelligenceOutput;
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
  moderationResult: Record<string, unknown> | null;
};

export type GenerateReplyInput = AnalyzeReviewInput & {
  mode: ReplyGenerationMode;
  instructions: string;
  brandVoice: Record<string, unknown>;
  insight: Record<string, unknown>;
};

export type GenerateReplyResult = {
  output: AiReplyOutput;
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
};

export interface AiReviewIntelligenceProvider {
  readonly id: string;
  readonly model: string;
  readonly promptVersion: string;
  availability(): AiProviderAvailability;
  analyzeReview(input: AnalyzeReviewInput): Promise<AnalyzeReviewResult>;
  generateReply?(input: GenerateReplyInput): Promise<GenerateReplyResult>;
  healthCheck(): Promise<AiProviderAvailability>;
}

export class AiProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(input: { code: string; message: string; retryable?: boolean }) {
    super(input.message);
    this.name = 'AiProviderError';
    this.code = input.code;
    this.retryable = input.retryable ?? false;
  }
}
