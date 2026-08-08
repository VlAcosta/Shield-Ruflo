export class ApiError extends Error {
  constructor(message, { status = 0, code = '', details = null, url = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.url = url;
  }
}

function combineAbortSignals(externalSignal, controller) {
  if (!externalSignal) return () => {};
  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener('abort', onAbort, { once: true });
  return () => externalSignal.removeEventListener('abort', onAbort);
}

async function readErrorBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => null);
  return response.text().catch(() => '');
}

function canRetry(error, method) {
  if (method !== 'GET') return false;
  if (error instanceof TypeError) return true;
  if (error?.name === 'AbortError') return true;
  if (error instanceof ApiError) return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  return false;
}

function wait(ms, signal) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      return;
    }
    let onAbort = null;
    const timer = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (!signal) return;
    onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function executeRequest(url, {
  method,
  body,
  headers,
  signal,
  timeout,
  credentials,
  responseType,
  idempotencyKey,
}) {
  const controller = new AbortController();
  const detach = combineAbortSignals(signal, controller);
  const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timeout', 'AbortError')), timeout);

  const normalizedHeaders = { ...headers };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && body !== null && !isFormData && !normalizedHeaders['Content-Type']) {
    normalizedHeaders['Content-Type'] = 'application/json';
  }
  if (idempotencyKey) normalizedHeaders['Idempotency-Key'] = idempotencyKey;

  try {
    const response = await fetch(url, {
      method,
      credentials,
      headers: normalizedHeaders,
      body: body === undefined || body === null || isFormData || typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await readErrorBody(response);
      const message = typeof payload === 'object' && payload
        ? payload.message || payload.error || `API request failed with ${response.status}`
        : payload || `API request failed with ${response.status}`;
      throw new ApiError(message, {
        status: response.status,
        code: typeof payload === 'object' && payload ? payload.code || '' : '',
        details: payload,
        url,
      });
    }

    if (response.status === 204 || responseType === 'none') return null;
    if (responseType === 'blob') return response.blob();
    if (responseType === 'text') return response.text();
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return response.text();
    return response.json();
  } finally {
    clearTimeout(timeoutId);
    detach();
  }
}

export async function apiRequest(url, {
  method = 'GET',
  body,
  headers = {},
  signal,
  timeout = 8000,
  credentials = 'include',
  responseType = 'json',
  idempotencyKey = '',
  retries,
  retryDelay = 280,
} = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const maxRetries = Number.isFinite(Number(retries)) ? Math.max(0, Number(retries)) : normalizedMethod === 'GET' ? 1 : 0;
  let attempt = 0;

  while (true) {
    try {
      return await executeRequest(url, {
        method: normalizedMethod,
        body,
        headers,
        signal,
        timeout,
        credentials,
        responseType,
        idempotencyKey,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (attempt >= maxRetries || !canRetry(error, normalizedMethod)) throw error;
      attempt += 1;
      await wait(retryDelay * (2 ** (attempt - 1)), signal);
    }
  }
}

export function joinEndpoint(base, path = '') {
  const cleanBase = String(base || '').replace(/\/$/, '');
  const cleanPath = String(path || '');
  if (!cleanPath) return cleanBase;
  return `${cleanBase}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
}

export function createIdempotencyKey(prefix = 'request') {
  const safePrefix = String(prefix || 'request').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${safePrefix}-${crypto.randomUUID()}`;
  }
  return `${safePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
