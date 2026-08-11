import { env } from '../../../config/env.js';
import { ASK_SHIELD_PROMPT_VERSION, askShieldProviderOutputSchema } from '../../ask-shield/ask-shield.schemas.js';
import type { AskShieldInput, AskShieldResult } from '../ai-provider.types.js';
import { AiProviderError } from '../ai-provider.types.js';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'evidenceIndexes', 'confidence', 'limitations'],
  properties: {
    answer: { type: 'string', minLength: 1, maxLength: 12000 },
    evidenceIndexes: { type: 'array', maxItems: 30, items: { type: 'integer', minimum: 0 } },
    confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    limitations: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 500 } },
  },
} as const;

const INSTRUCTIONS = `You are Ask Shield, a read-only business reputation analyst.
Answer ONLY from the supplied Business Shield tenant context and evidence list.
Do not use outside knowledge, do not invent missing metrics, people, reviews, causes, or actions already performed.
Evidence indexes must reference only supplied evidence entries and only entries that materially support the answer.
If the data is insufficient, say so and lower confidence.
Separate observations from recommendations. Recommendations are suggestions, never claims that an action was executed.
Do not reveal hidden chain-of-thought. Return a concise business-facing answer with explicit limitations.`;

function outputText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content ?? []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

function estimatedCostMicros(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  const inputRate = env.AI_OPENAI_INPUT_COST_MICROS_PER_MILLION_TOKENS;
  const outputRate = env.AI_OPENAI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
  if (inputRate <= 0 && outputRate <= 0) return null;
  return Math.round((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000);
}

export async function answerOpenAiShieldQuestion(input: AskShieldInput, provider: { id: string; model: string }): Promise<AskShieldResult> {
  if (!env.AI_REVIEW_INTELLIGENCE_ENABLED || !env.AI_OPENAI_API_KEY || !provider.model) {
    throw new AiProviderError({ code: 'AI_PROVIDER_NOT_CONFIGURED', message: 'AI provider не настроен', retryable: false });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_OPENAI_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${env.AI_OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        instructions: INSTRUCTIONS,
        input: JSON.stringify({
          question: input.question,
          tenant: { organizationName: input.organizationName, locale: input.locale },
          context: input.context,
          evidence: input.evidence.map((item, index) => ({ index, ...item })),
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'business_shield_readonly_answer',
            strict: true,
            schema: OUTPUT_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new AiProviderError({
      code: aborted ? 'ASK_SHIELD_PROVIDER_TIMEOUT' : 'ASK_SHIELD_PROVIDER_NETWORK_ERROR',
      message: aborted ? 'Ask Shield provider timeout' : 'Ask Shield provider network error',
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new AiProviderError({ code: `ASK_SHIELD_PROVIDER_HTTP_${response.status}`, message: `Ask Shield provider returned HTTP ${response.status}`, retryable });
  }
  const payload = await response.json() as any;
  const text = outputText(payload);
  if (!text) throw new AiProviderError({ code: 'ASK_SHIELD_OUTPUT_EMPTY', message: 'Ask Shield provider returned empty output', retryable: true });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch {
    throw new AiProviderError({ code: 'ASK_SHIELD_OUTPUT_INVALID_JSON', message: 'Ask Shield provider returned invalid JSON', retryable: false });
  }
  const parsed = askShieldProviderOutputSchema.safeParse(raw);
  if (!parsed.success) throw new AiProviderError({ code: 'ASK_SHIELD_OUTPUT_INVALID', message: 'Ask Shield output failed domain validation', retryable: false });
  const inputTokens = Number.isFinite(payload?.usage?.input_tokens) ? Number(payload.usage.input_tokens) : null;
  const outputTokens = Number.isFinite(payload?.usage?.output_tokens) ? Number(payload.usage.output_tokens) : null;
  return {
    output: parsed.data,
    provider: provider.id,
    model: provider.model,
    modelVersion: null,
    promptVersion: ASK_SHIELD_PROMPT_VERSION,
    inputTokens,
    outputTokens,
    estimatedCostMicros: estimatedCostMicros(inputTokens, outputTokens),
  };
}
