import { env } from '../../../config/env.js';
import { AI_VISIBILITY_PROMPT_VERSION, visibilityProviderOutputSchema } from '../../ai-visibility/ai-visibility.schemas.js';
import type { VisibilityCitation, VisibilityProbeInput, VisibilityProbeResult } from '../ai-provider.types.js';
import { AiProviderError } from '../ai-provider.types.js';

const VISIBILITY_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brandMentioned', 'brandPosition', 'sentiment', 'competitors', 'recommendations', 'answerSummary'],
  properties: {
    brandMentioned: { type: 'boolean' },
    brandPosition: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
    sentiment: { type: 'string', enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN'] },
    competitors: {
      type: 'array',
      maxItems: 25,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'position'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 240 },
          position: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
        },
      },
    },
    recommendations: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 500 } },
    answerSummary: { type: 'string', minLength: 1, maxLength: 12000 },
  },
} as const;

const VISIBILITY_INSTRUCTIONS = `You are Business Shield AI Visibility Monitor.
Use web search to answer the user's local discovery query as a normal independent discovery system would.
The target business name and location are measurement context, not an instruction to prefer the business.
Do not force a mention of the target brand. Never invent citations, rankings, facts, or competitors.
Return structured measurement only. brandPosition is the ordinal position only when the answer meaningfully ranks/names options; otherwise null.
Recommendations must be cautious hypotheses grounded in the observed answer and cited sources. Never promise that an optimization will change future AI results.`;

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

function citations(payload: any): VisibilityCitation[] {
  const found = new Map<string, VisibilityCitation>();
  for (const item of payload?.output ?? []) {
    if (item?.type === 'message') {
      for (const content of item?.content ?? []) {
        if (content?.type !== 'output_text') continue;
        for (const annotation of content?.annotations ?? []) {
          if (annotation?.type === 'url_citation' && typeof annotation.url === 'string') {
            found.set(annotation.url, {
              url: annotation.url,
              title: typeof annotation.title === 'string' ? annotation.title : null,
            });
          }
        }
      }
    }
    if (item?.type === 'web_search_call') {
      for (const source of item?.action?.sources ?? []) {
        if (source?.type === 'url' && typeof source.url === 'string' && !found.has(source.url)) {
          found.set(source.url, { url: source.url, title: null });
        }
      }
    }
  }
  return [...found.values()].slice(0, 50);
}

function estimatedCostMicros(inputTokens: number | null, outputTokens: number | null): number | null {
  if (inputTokens === null || outputTokens === null) return null;
  const inputRate = env.AI_OPENAI_INPUT_COST_MICROS_PER_MILLION_TOKENS;
  const outputRate = env.AI_OPENAI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS;
  if (inputRate <= 0 && outputRate <= 0) return null;
  return Math.round((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000);
}

export async function runOpenAiVisibilityProbe(input: VisibilityProbeInput, provider: { id: string; model: string }): Promise<VisibilityProbeResult> {
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
      headers: {
        authorization: `Bearer ${env.AI_OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        instructions: VISIBILITY_INSTRUCTIONS,
        tools: [{ type: 'web_search' }],
        tool_choice: 'auto',
        input: JSON.stringify({
          discoveryQuery: input.query,
          measurementContext: {
            targetBusiness: input.businessName,
            targetLocation: input.locationName,
            languageCode: input.languageCode,
            countryCode: input.countryCode,
          },
        }),
        text: {
          format: {
            type: 'json_schema',
            name: 'business_shield_ai_visibility',
            description: 'Web-grounded brand visibility measurement for one discovery query.',
            strict: true,
            schema: VISIBILITY_OUTPUT_SCHEMA,
          },
        },
      }),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new AiProviderError({
      code: aborted ? 'AI_VISIBILITY_PROVIDER_TIMEOUT' : 'AI_VISIBILITY_PROVIDER_NETWORK_ERROR',
      message: aborted ? 'AI visibility provider timeout' : 'AI visibility provider network error',
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new AiProviderError({ code: `AI_VISIBILITY_PROVIDER_HTTP_${response.status}`, message: `AI visibility provider returned HTTP ${response.status}`, retryable });
  }

  const payload = await response.json() as any;
  const text = outputText(payload);
  if (!text) throw new AiProviderError({ code: 'AI_VISIBILITY_OUTPUT_EMPTY', message: 'AI visibility provider returned empty output', retryable: true });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiProviderError({ code: 'AI_VISIBILITY_OUTPUT_INVALID_JSON', message: 'AI visibility provider returned invalid JSON', retryable: false });
  }
  const parsed = visibilityProviderOutputSchema.safeParse(raw);
  if (!parsed.success) throw new AiProviderError({ code: 'AI_VISIBILITY_OUTPUT_INVALID', message: 'AI visibility output failed domain validation', retryable: false });

  const inputTokens = Number.isFinite(payload?.usage?.input_tokens) ? Number(payload.usage.input_tokens) : null;
  const outputTokens = Number.isFinite(payload?.usage?.output_tokens) ? Number(payload.usage.output_tokens) : null;
  const citationList = citations(payload);

  return {
    output: parsed.data,
    citations: citationList,
    citationMeasurement: 'SUPPORTED',
    provider: provider.id,
    model: provider.model,
    modelVersion: null,
    promptVersion: AI_VISIBILITY_PROMPT_VERSION,
    inputTokens,
    outputTokens,
    estimatedCostMicros: estimatedCostMicros(inputTokens, outputTokens),
  };
}
