import { ProviderAdapterError } from '../provider.errors.js';

const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_ACCOUNT_MANAGEMENT_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const GOOGLE_BUSINESS_INFORMATION_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';

export const GOOGLE_BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';

export type GoogleBusinessAccount = {
  name: string;
  accountName?: string | undefined;
  type?: string | undefined;
  role?: string | undefined;
  verificationState?: string | undefined;
  vettedState?: string | undefined;
};

export type GoogleBusinessLocation = {
  name: string;
  title?: string | undefined;
  storeCode?: string | undefined;
  phoneNumbers?: Record<string, unknown> | undefined;
  categories?: Record<string, unknown> | undefined;
  storefrontAddress?: Record<string, unknown> | undefined;
  websiteUri?: string | undefined;
  regularHours?: Record<string, unknown> | undefined;
  openInfo?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
  scope?: string | undefined;
  tokenType?: string | undefined;
};

type GoogleClientOptions = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  timeoutMs: number;
  fetcher?: typeof fetch | undefined;
};

type GoogleErrorPayload = {
  error?: unknown;
  error_description?: unknown;
};

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function providerError(status: number, operation: string): ProviderAdapterError {
  if (status === 401) {
    return new ProviderAdapterError({
      code: 'GOOGLE_OAUTH_INVALID',
      message: 'Авторизация Google истекла или была отозвана. Подключите Google Business Profile заново.',
      statusCode: 401,
      retryable: false,
    });
  }
  if (status === 403) {
    return new ProviderAdapterError({
      code: 'GOOGLE_BUSINESS_ACCESS_DENIED',
      message: 'Google Business Profile API отклонил доступ. Проверьте права аккаунта и одобрение API проекта.',
      statusCode: 403,
      retryable: false,
    });
  }
  if (status === 404) {
    return new ProviderAdapterError({
      code: 'GOOGLE_BUSINESS_RESOURCE_NOT_FOUND',
      message: 'Запрошенный ресурс Google Business Profile не найден или недоступен этому аккаунту.',
      statusCode: 404,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ProviderAdapterError({
      code: 'GOOGLE_BUSINESS_RATE_LIMITED',
      message: 'Google Business Profile временно ограничил частоту запросов.',
      statusCode: 429,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new ProviderAdapterError({
      code: 'GOOGLE_BUSINESS_UPSTREAM_UNAVAILABLE',
      message: 'Google Business Profile временно недоступен.',
      statusCode: 503,
      retryable: true,
    });
  }
  return new ProviderAdapterError({
    code: 'GOOGLE_BUSINESS_REQUEST_FAILED',
    message: `Не удалось выполнить операцию Google Business Profile: ${operation}`,
    statusCode: 502,
    retryable: false,
  });
}

export class GoogleBusinessProfileClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: GoogleClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.redirectUri = options.redirectUri;
    this.timeoutMs = options.timeoutMs;
    this.fetcher = options.fetcher ?? fetch;
  }

  authorizationUrl(state: string): string {
    const url = new URL(GOOGLE_AUTHORIZATION_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_BUSINESS_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });
    return this.tokenRequest(body, 'oauth-code-exchange');
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    return this.tokenRequest(body, 'oauth-token-refresh');
  }

  async revokeToken(token: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(GOOGLE_REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_OAUTH_REVOKE_UNAVAILABLE',
        message: 'Не удалось связаться с сервисом отзыва доступа Google.',
        retryable: true,
        statusCode: 503,
        cause: error,
      });
    }
    if (!response.ok) throw providerError(response.status, 'oauth-revoke');
  }

  async listAccounts(accessToken: string): Promise<GoogleBusinessAccount[]> {
    const accounts: GoogleBusinessAccount[] = [];
    let pageToken = '';
    do {
      const url = new URL(`${GOOGLE_ACCOUNT_MANAGEMENT_URL}/accounts`);
      url.searchParams.set('pageSize', '20');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const payload = await this.authorizedJson<{ accounts?: GoogleBusinessAccount[]; nextPageToken?: string }>(
        url,
        accessToken,
        'accounts.list',
      );
      accounts.push(...(Array.isArray(payload.accounts) ? payload.accounts : []));
      pageToken = nonEmptyString(payload.nextPageToken) ?? '';
    } while (pageToken);
    return accounts;
  }

  async listLocations(accessToken: string, accountName: string): Promise<GoogleBusinessLocation[]> {
    if (!/^accounts\/[^/]+$/.test(accountName)) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_ACCOUNT_NAME_INVALID',
        message: 'Некорректный идентификатор Google Business Profile account.',
        statusCode: 400,
      });
    }

    const locations: GoogleBusinessLocation[] = [];
    let pageToken = '';
    do {
      const url = new URL(`${GOOGLE_BUSINESS_INFORMATION_URL}/${accountName}/locations`);
      url.searchParams.set('pageSize', '100');
      url.searchParams.set(
        'readMask',
        'name,title,storeCode,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,openInfo,metadata',
      );
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const payload = await this.authorizedJson<{ locations?: GoogleBusinessLocation[]; nextPageToken?: string }>(
        url,
        accessToken,
        'locations.list',
      );
      locations.push(...(Array.isArray(payload.locations) ? payload.locations : []));
      pageToken = nonEmptyString(payload.nextPageToken) ?? '';
    } while (pageToken);
    return locations;
  }

  private async tokenRequest(body: URLSearchParams, operation: string): Promise<GoogleTokenResponse> {
    let response: Response;
    try {
      response = await this.fetcher(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_OAUTH_UNAVAILABLE',
        message: 'Не удалось связаться с OAuth сервисом Google.',
        retryable: true,
        statusCode: 503,
        cause: error,
      });
    }

    let payload: GoogleErrorPayload & Record<string, unknown> = {};
    try {
      payload = await response.json() as GoogleErrorPayload & Record<string, unknown>;
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const oauthError = nonEmptyString(payload.error);
      if (oauthError === 'invalid_grant') {
        throw new ProviderAdapterError({
          code: 'GOOGLE_OAUTH_INVALID_GRANT',
          message: 'Google OAuth grant недействителен или был отозван. Подключите аккаунт заново.',
          statusCode: 401,
          retryable: false,
        });
      }
      throw providerError(response.status, operation);
    }

    const accessToken = nonEmptyString(payload.access_token);
    if (!accessToken) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_OAUTH_RESPONSE_INVALID',
        message: 'Google OAuth не вернул access token.',
        statusCode: 502,
      });
    }

    return {
      accessToken,
      refreshToken: nonEmptyString(payload.refresh_token),
      expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : undefined,
      scope: nonEmptyString(payload.scope),
      tokenType: nonEmptyString(payload.token_type),
    };
  }

  private async authorizedJson<T>(url: URL, accessToken: string, operation: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          'x-goog-api-format-version': '2',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_BUSINESS_UPSTREAM_UNAVAILABLE',
        message: 'Не удалось связаться с Google Business Profile API.',
        retryable: true,
        statusCode: 503,
        cause: error,
      });
    }

    if (!response.ok) throw providerError(response.status, operation);
    try {
      return await response.json() as T;
    } catch (error) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_BUSINESS_RESPONSE_INVALID',
        message: 'Google Business Profile вернул некорректный ответ.',
        statusCode: 502,
        retryable: false,
        cause: error,
      });
    }
  }
}
