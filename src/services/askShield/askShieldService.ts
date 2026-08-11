import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

export type AskShieldEvidence = {
  type: 'review' | 'aggregate' | 'case' | 'task' | 'ai_visibility' | 'listing_health' | 'competitive';
  id: string | null;
  label: string;
  route: string | null;
  summary: string | null;
};

export type AskShieldQuery = {
  id: string;
  question: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  answer: string | null;
  evidence: AskShieldEvidence[];
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export function askShield(question: string) {
  return apiRequest<{ query: AskShieldQuery }>(joinEndpoint(API_BASE, '/ask-shield/queries'), { method: 'POST', body: { question }, timeout: 12_000 });
}

export function getAskShieldQuery(queryId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ query: AskShieldQuery }>(joinEndpoint(API_BASE, `/ask-shield/queries/${encodeURIComponent(queryId)}`), { signal: options.signal, timeout: 12_000 });
}

export function getAskShieldHistory(options: { signal?: AbortSignal; limit?: number } = {}) {
  const limit = options.limit ?? 30;
  return apiRequest<{ items: AskShieldQuery[]; nextCursor: string | null }>(joinEndpoint(API_BASE, `/ask-shield/queries?limit=${limit}`), { signal: options.signal, timeout: 12_000 });
}
