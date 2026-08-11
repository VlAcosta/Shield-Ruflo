import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';

export type ReplyGenerationMode = 'CONCISE' | 'EMPATHETIC' | 'FORMAL' | 'RECOVERY_FOCUSED';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  if (!signal) return;
  const abort = () => {
    window.clearTimeout(timer);
    reject(signal.reason || new DOMException('Aborted', 'AbortError'));
  };
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
});

export async function generateAiReply(reviewId: string, input: { mode: ReplyGenerationMode; instructions?: string }) {
  return apiRequest<{ operationId: string; jobId: string; status: string }>(
    joinEndpoint(API_BASE, `/reviews/${encodeURIComponent(reviewId)}/ai-reply`),
    { method: 'POST', body: input, timeout: 10_000 },
  );
}

export async function getAiReplyOperation(reviewId: string, operationId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ operation: any }>(
    joinEndpoint(API_BASE, `/reviews/${encodeURIComponent(reviewId)}/ai-reply/${encodeURIComponent(operationId)}`),
    { signal: options.signal, timeout: 10_000 },
  );
}

export async function waitForAiReply(
  reviewId: string,
  operationId: string,
  options: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number } = {},
) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 900;
  while (Date.now() - started < timeoutMs) {
    const payload = await getAiReplyOperation(reviewId, operationId, { signal: options.signal });
    const operation = payload.operation;
    if (operation?.status === 'SUCCEEDED') return operation;
    if (operation?.status === 'FAILED' || operation?.status === 'SKIPPED') {
      throw new Error(operation?.errorMessage || operation?.errorCode || 'Не удалось создать AI-ответ');
    }
    await sleep(intervalMs, options.signal);
  }
  throw new Error('AI-ответ создаётся дольше ожидаемого. Операция продолжится в фоне.');
}

export async function getBrandVoice(options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ profile: any }>(joinEndpoint(API_BASE, '/ai/brand-voice'), { signal: options.signal });
}

export async function saveBrandVoice(profile: Record<string, unknown>) {
  return apiRequest<{ profile: any }>(joinEndpoint(API_BASE, '/ai/brand-voice'), { method: 'PUT', body: profile });
}

export async function getReplyAutopilot(options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ policy: any }>(joinEndpoint(API_BASE, '/ai/reply-autopilot'), { signal: options.signal });
}

export async function saveReplyAutopilot(policy: Record<string, unknown>) {
  return apiRequest<{ policy: any }>(joinEndpoint(API_BASE, '/ai/reply-autopilot'), { method: 'PUT', body: policy });
}
