import { getRuntimeEnv } from '../core/runtimeEnv';

const SUGGESTION_ENDPOINT = getRuntimeEnv('SUGGESTIONS_ENDPOINT', '');
const DRAFT_KEY = 'business-shield:suggestions:unsent:v2';

function storeUnsentDraft(payload) {
  const item = {
    id: `suggestion-draft-${Date.now()}`,
    ...payload,
    createdAt: new Date().toISOString(),
    status: 'unsent',
  };
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(item)); } catch { /* recovery is best effort */ }
  return item;
}

export async function sendSuggestion(payload) {
  if (!SUGGESTION_ENDPOINT) {
    const draft = storeUnsentDraft(payload);
    const error = new Error('Сервер отправки предложений не настроен');
    error.unsentDraft = draft;
    throw error;
  }

  let response;
  try {
    response = await fetch(SUGGESTION_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    const draft = storeUnsentDraft(payload);
    const error = new Error('Нет связи с сервером. Предложение сохранено как неотправленный черновик.');
    error.cause = networkError;
    error.unsentDraft = draft;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const draft = storeUnsentDraft(payload);
    const error = new Error(body?.message || 'Не удалось сохранить предложение на сервере');
    error.unsentDraft = draft;
    throw error;
  }
  if (body?.persisted !== true || !body?.suggestion?.id) {
    const draft = storeUnsentDraft(payload);
    const error = new Error('Сервер не подтвердил сохранение предложения');
    error.unsentDraft = draft;
    throw error;
  }

  try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
  return { mode: 'api', ...body };
}

export const suggestionServiceConfig = Object.freeze({
  endpointConfigured: Boolean(SUGGESTION_ENDPOINT),
  authoritativePersistence: true,
});
