export type ApiResponseType = 'json' | 'text' | 'blob' | 'none';

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  details?: unknown;
  url?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly url: string;

  constructor(message: string, { status = 0, code = '', details = null, url = '' }: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.url = url;
  }
}

export const AUTH_SESSION_INVALID_EVENT = 'business-shield:auth-session-invalid';

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeout?: number;
  credentials?: RequestCredentials;
  responseType?: ApiResponseType;
  idempotencyKey?: string;
  retries?: number;
  retryDelay?: number;
}

function notifyInvalidSession(response: Response): void {
  if (response.status !== 401 || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALID_EVENT, {
    detail: { status: response.status, url: response.url },
  }));
}

function combineAbortSignals(externalSignal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!externalSignal) return () => undefined;
  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return () => undefined;
  }
  const onAbort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener('abort', onAbort, { once: true });
  return () => externalSignal.removeEventListener('abort', onAbort);
}

async function readErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json().catch(() => null);
  return response.text().catch(() => '');
}

function canRetry(error: unknown, method: string): boolean {
  if (method !== 'GET') return false;
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof ApiError) return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  return false;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      return;
    }
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
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function executeRequest<T>(url: string, options: Required<Pick<ApiRequestOptions, 'method' | 'headers' | 'timeout' | 'credentials' | 'responseType' | 'idempotencyKey'>> & Pick<ApiRequestOptions, 'body' | 'signal'>): Promise<T> {
  const controller = new AbortController();
  const detach = combineAbortSignals(options.signal, controller);
  const timeoutId = window.setTimeout(
    () => controller.abort(new DOMException('Request timeout', 'AbortError')),
    options.timeout,
  );

  const normalizedHeaders: Record<string, string> = { ...options.headers };
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && options.body !== null && !isFormData && !normalizedHeaders['Content-Type']) {
    normalizedHeaders['Content-Type'] = 'application/json';
  }
  if (options.idempotencyKey) normalizedHeaders['Idempotency-Key'] = options.idempotencyKey;

  let requestBody: BodyInit | null | undefined;
  if (options.body === undefined || options.body === null || isFormData || typeof options.body === 'string') {
    requestBody = options.body as BodyInit | null | undefined;
  } else {
    requestBody = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, {
      method: options.method,
      credentials: options.credentials,
      headers: normalizedHeaders,
      body: requestBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      notifyInvalidSession(response);
      const payload = await readErrorBody(response);
      const payloadRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
      const nestedError = payloadRecord?.error;
      const errorPayload = nestedError && typeof nestedError === 'object' ? nestedError as Record<string, unknown> : payloadRecord;
      const message = errorPayload
        ? String(errorPayload.message || `API request failed with ${response.status}`)
        : typeof payload === 'string' && payload
          ? payload
          : `API request failed with ${response.status}`;
      throw new ApiError(message, {
        status: response.status,
        code: errorPayload ? String(errorPayload.code || '') : '',
        details: payload,
        url,
      });
    }

    if (response.status === 204 || options.responseType === 'none') return null as T;
    if (options.responseType === 'blob') return await response.blob() as T;
    if (options.responseType === 'text') return await response.text() as T;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return await response.text() as T;
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeoutId);
    detach();
  }
}

export async function apiRequest<T = unknown>(url: string, {
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
}: ApiRequestOptions = {}): Promise<T> {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const maxRetries = Number.isFinite(Number(retries))
    ? Math.max(0, Number(retries))
    : normalizedMethod === 'GET' ? 1 : 0;
  let attempt = 0;

  while (true) {
    try {
      return await executeRequest<T>(url, {
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

export function joinEndpoint(base: string, path = ''): string {
  const cleanBase = String(base || '').replace(/\/$/, '');
  const cleanPath = String(path || '');
  if (!cleanPath) return cleanBase;
  if (cleanPath.startsWith('?')) return `${cleanBase}${cleanPath}`;
  return `${cleanBase}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
}

export function createIdempotencyKey(prefix = 'request'): string {
  const safePrefix = String(prefix || 'request').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${safePrefix}-${crypto.randomUUID()}`;
  }
  return `${safePrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
