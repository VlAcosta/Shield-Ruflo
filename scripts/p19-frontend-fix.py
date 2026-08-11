#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P19 frontend patch anchor missing: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'patched {path}')

# Replace loose any contracts with explicit P19 API types.
service = ROOT / 'src/services/reviews/replyCopilotService.ts'
service.write_text('''import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';

export type ReplyGenerationMode = 'CONCISE' | 'EMPATHETIC' | 'FORMAL' | 'RECOVERY_FOCUSED';

export type ReviewReplyRecord = {
  id: string;
  text: string;
  status: string;
  version: number;
  origin?: string | null;
  generationMode?: string | null;
  policyDecision?: string | null;
  policyVersion?: string | null;
  policyMetadata?: unknown;
  providerState?: string | null;
  providerPolicyViolation?: unknown;
  lastReconciledAt?: string | null;
  failedReason?: string | null;
};

export type AiReplyOperation = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  reply?: ReviewReplyRecord | null;
};

export type BrandVoiceProfile = {
  tone: 'PROFESSIONAL' | 'FRIENDLY' | 'PREMIUM' | 'NEUTRAL' | 'EMPATHETIC' | 'CUSTOM';
  formality: 'FORMAL' | 'BALANCED' | 'CASUAL';
  primaryLanguage: string;
  responseLength: 'SHORT' | 'MEDIUM' | 'DETAILED';
  greetingStyle: string;
  signature: string;
  preferredPhrases: string[];
  prohibitedPhrases: string[];
  legalDisclaimer: string;
  compensationPolicy: 'FORBID' | 'REQUIRE_APPROVAL' | 'ALLOW';
  escalationTriggers: string[];
  customInstructions: string;
};

export type ReplyAutopilotPolicy = {
  enabled: boolean;
  minimumRating: number;
  maximumReputationRisk: number;
  minimumAiConfidence: number;
};

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\\\/$/, '');

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  let onAbort: (() => void) | null = null;
  const timer = window.setTimeout(() => {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  if (!signal) return;
  onAbort = () => {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort as EventListener);
    reject(signal.reason || new DOMException('Aborted', 'AbortError'));
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
});

export async function generateAiReply(reviewId: string, input: { mode: ReplyGenerationMode; instructions?: string }) {
  return apiRequest<{ operationId: string; jobId: string; status: 'QUEUED' }>(
    joinEndpoint(API_BASE, `/reviews/${encodeURIComponent(reviewId)}/ai-reply`),
    { method: 'POST', body: input, timeout: 10_000 },
  );
}

export async function getAiReplyOperation(reviewId: string, operationId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ operation: AiReplyOperation }>(
    joinEndpoint(API_BASE, `/reviews/${encodeURIComponent(reviewId)}/ai-reply/${encodeURIComponent(operationId)}`),
    { signal: options.signal, timeout: 10_000 },
  );
}

export async function waitForAiReply(
  reviewId: string,
  operationId: string,
  options: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number } = {},
): Promise<AiReplyOperation> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 900;
  while (Date.now() - started < timeoutMs) {
    const payload = await getAiReplyOperation(reviewId, operationId, { signal: options.signal });
    const operation = payload.operation;
    if (operation.status === 'SUCCEEDED') return operation;
    if (operation.status === 'FAILED' || operation.status === 'SKIPPED') {
      throw new Error(operation.errorMessage || operation.errorCode || 'Не удалось создать AI-ответ');
    }
    await sleep(intervalMs, options.signal);
  }
  throw new Error('AI-ответ создаётся дольше ожидаемого. Операция продолжится в фоне.');
}

export async function getBrandVoice(options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ profile: BrandVoiceProfile }>(joinEndpoint(API_BASE, '/ai/brand-voice'), { signal: options.signal });
}

export async function saveBrandVoice(profile: Partial<BrandVoiceProfile>) {
  return apiRequest<{ profile: BrandVoiceProfile }>(joinEndpoint(API_BASE, '/ai/brand-voice'), { method: 'PUT', body: profile });
}

export async function getReplyAutopilot(options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ policy: ReplyAutopilotPolicy }>(joinEndpoint(API_BASE, '/ai/reply-autopilot'), { signal: options.signal });
}

export async function saveReplyAutopilot(policy: Partial<ReplyAutopilotPolicy>) {
  return apiRequest<{ policy: ReplyAutopilotPolicy }>(joinEndpoint(API_BASE, '/ai/reply-autopilot'), { method: 'PUT', body: policy });
}
''', encoding='utf-8')
print('rewrote replyCopilotService.ts with explicit contracts')

# Remove obsolete local AI draft generation from production service now that the
# Review Intelligence hook exclusively uses the P19 backend Copilot endpoint.
legacy = ROOT / 'src/services/reviews/reviewIntelligenceService.js'
text = legacy.read_text(encoding='utf-8')
start = text.find('function reasonFromText(')
end = text.find('export async function ensureNegativeReviewTask(', start)
if start == -1 or end == -1:
    raise SystemExit('P19 legacy AI fallback block not found')
text = text[:start] + text[end:]
text = text.replace("const AI_ENDPOINT = String(getRuntimeEnv('REVIEWS_AI_ENDPOINT')).replace(/\\\/$/, '');\n", '')
legacy.write_text(text, encoding='utf-8')
print('removed unreachable local AI fallback')

# Add styles for new P19 mode selector and Brand Voice fields while preserving themes.
scss = ROOT / 'src/features/reviews/ReviewsIntelligence/ReviewsIntelligenceWorkspace.scss'
text = scss.read_text(encoding='utf-8')
marker = '/* P19 AI Reply Copilot */'
if marker not in text:
    text += '''\n\n/* P19 AI Reply Copilot */
.reviews-copilot__modes { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.reviews-copilot__modes button { min-height: 34px; padding: 7px 11px; border-radius: 10px; border: 1px solid var(--border-color, rgba(127,127,127,.22)); background: transparent; color: inherit; cursor: pointer; }
.reviews-copilot__modes button.is-active { border-color: currentColor; background: rgba(127,127,127,.1); font-weight: 650; }
.reviews-copilot__modes button:disabled { opacity: .55; cursor: not-allowed; }
.reviews-settings__brandGrid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 14px; }
.reviews-settings__brandGrid label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.reviews-settings__brandGrid input, .reviews-settings__brandGrid select { min-height: 42px; width: 100%; border: 1px solid var(--border-color, rgba(127,127,127,.22)); border-radius: 10px; padding: 8px 10px; background: var(--surface, transparent); color: inherit; }
@media (max-width: 680px) { .reviews-settings__brandGrid { grid-template-columns: 1fr; } .reviews-copilot__modes { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); } }
'''
    scss.write_text(text, encoding='utf-8')
    print('added P19 styles')

print('P19 frontend cleanup applied')
