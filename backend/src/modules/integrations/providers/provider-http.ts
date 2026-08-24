import { ProviderAdapterError } from './provider.errors.js';

type ProviderHttpOptions = {
  timeoutMs?: number;
  provider: string;
  successStatuses?: number[];
};

const OFFICIAL_PROVIDER_HOSTS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  wildberries: new Set(['feedbacks-api.wildberries.ru']),
  ozon: new Set(['api-seller.ozon.ru']),
  '2gis': new Set(['catalog.api.2gis.com']),
});

function assertAllowedProviderTarget(rawUrl: string, provider: string): void {
  const allowedHosts = OFFICIAL_PROVIDER_HOSTS[provider.toLowerCase()];
  if (!allowedHosts) return;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new ProviderAdapterError({
      code: `${provider.toUpperCase()}_URL_INVALID`,
      message: `${provider}: некорректный адрес внешнего API`,
      statusCode: 422,
      retryable: false,
      cause: error,
    });
  }
  if (
    url.protocol !== 'https:'
    || Boolean(url.username)
    || Boolean(url.password)
    || !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new ProviderAdapterError({
      code: `${provider.toUpperCase()}_HOST_NOT_ALLOWED`,
      message: `${provider}: запрос разрешён только к официальному API host`,
      statusCode: 422,
      retryable: false,
    });
  }
}

function errorForStatus(provider: string, status: number): ProviderAdapterError {
  if (status === 401 || status === 403) {
    return new ProviderAdapterError({
      code: `${provider.toUpperCase()}_AUTH_FAILED`,
      message: `Провайдер ${provider} отклонил учётные данные`,
      statusCode: 422,
      retryable: false,
    });
  }
  if (status === 404) {
    return new ProviderAdapterError({
      code: `${provider.toUpperCase()}_RESOURCE_NOT_FOUND`,
      message: `Объект ${provider} не найден или недоступен`,
      statusCode: 422,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ProviderAdapterError({
      code: `${provider.toUpperCase()}_RATE_LIMITED`,
      message: `${provider}: превышен лимит запросов`,
      statusCode: 429,
      retryable: true,
    });
  }
  return new ProviderAdapterError({
    code: `${provider.toUpperCase()}_REQUEST_FAILED`,
    message: `${provider}: внешний API вернул HTTP ${status}`,
    statusCode: status >= 500 ? 502 : 422,
    retryable: status >= 500,
  });
}

export async function providerFetch(
  url: string,
  init: RequestInit,
  options: ProviderHttpOptions,
): Promise<Response> {
  assertAllowedProviderTarget(url, options.provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const accepted = options.successStatuses ?? [];
    if (!response.ok && !accepted.includes(response.status)) {
      throw errorForStatus(options.provider, response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderAdapterError({
        code: `${options.provider.toUpperCase()}_TIMEOUT`,
        message: `${options.provider}: внешний API не ответил вовремя`,
        statusCode: 504,
        retryable: true,
        cause: error,
      });
    }
    throw new ProviderAdapterError({
      code: `${options.provider.toUpperCase()}_NETWORK_FAILED`,
      message: `${options.provider}: ошибка сетевого запроса`,
      statusCode: 502,
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function providerFetchJson<T>(
  url: string,
  init: RequestInit,
  options: ProviderHttpOptions,
): Promise<T> {
  const response = await providerFetch(url, init, options);
  try {
    return await response.json() as T;
  } catch (error) {
    throw new ProviderAdapterError({
      code: `${options.provider.toUpperCase()}_INVALID_RESPONSE`,
      message: `${options.provider}: внешний API вернул некорректный JSON`,
      statusCode: 502,
      retryable: true,
      cause: error,
    });
  }
}

export function requireCredential(
  credentials: Readonly<Record<string, string>>,
  key: string,
  provider: string,
): string {
  const value = String(credentials[key] || '').trim();
  if (!value) {
    throw new ProviderAdapterError({
      code: `${provider.toUpperCase()}_CREDENTIAL_REQUIRED`,
      message: `${provider}: не заполнено обязательное поле ${key}`,
      statusCode: 422,
      retryable: false,
    });
  }
  return value;
}

export function configString(configuration: Record<string, unknown>, key: string): string {
  return typeof configuration[key] === 'string' ? String(configuration[key]).trim() : '';
}
