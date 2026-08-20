import { getRuntimeEnv } from '../core/runtimeEnv';

const SUGGESTION_ENDPOINT = getRuntimeEnv('SUGGESTIONS_ENDPOINT', '');
const SUGGESTION_EMAIL = getRuntimeEnv('SUGGESTIONS_EMAIL', '');
const QUEUE_KEY = 'business-shield:suggestions:queue:v1';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

function storeFallback(payload) {
  const item = {
    id: `suggestion-${Date.now()}`,
    ...payload,
    createdAt: new Date().toISOString(),
    status: 'queued',
  };
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify([item, ...readQueue()].slice(0, 30))); } catch { /* keep UI working */ }
  return item;
}

export async function sendSuggestion(payload) {
  if (SUGGESTION_ENDPOINT) {
    const response = await fetch(SUGGESTION_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, destination: SUGGESTION_EMAIL || undefined }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message || 'Не удалось отправить идею');
    }
    return { mode: 'api', ...(await response.json().catch(() => ({}))) };
  }

  const queued = storeFallback(payload);

  if (SUGGESTION_EMAIL && typeof window !== 'undefined') {
    const subject = encodeURIComponent(`[Бизнес Щит] ${payload.subject || 'Предложение по продукту'}`);
    const body = encodeURIComponent([
      `Категория: ${payload.category || 'Другое'}`,
      `От: ${payload.name || 'Пользователь'}`,
      `Email для ответа: ${payload.email || 'не указан'}`,
      '',
      payload.message || '',
    ].join('\n'));
    window.location.href = `mailto:${SUGGESTION_EMAIL}?subject=${subject}&body=${body}`;
    return { mode: 'mailto', queued };
  }

  return { mode: 'queued', queued };
}

export const suggestionServiceConfig = Object.freeze({
  endpointConfigured: Boolean(SUGGESTION_ENDPOINT),
  emailConfigured: Boolean(SUGGESTION_EMAIL),
});
