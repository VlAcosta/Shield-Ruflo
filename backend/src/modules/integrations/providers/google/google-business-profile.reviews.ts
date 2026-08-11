import { ProviderAdapterError } from '../provider.errors.js';

const GOOGLE_MY_BUSINESS_V4 = 'https://mybusiness.googleapis.com/v4';
const MAX_PAGE_SIZE = 50;

export type GoogleReviewer = {
  profilePhotoUrl?: string | undefined;
  displayName?: string | undefined;
  isAnonymous?: boolean | undefined;
};

export type GoogleReviewReply = {
  comment?: string | undefined;
  updateTime?: string | undefined;
  reviewReplyState?: string | undefined;
  policyViolation?: unknown;
};

export type GoogleReview = {
  name?: string | undefined;
  reviewId?: string | undefined;
  reviewer?: GoogleReviewer | undefined;
  starRating?: string | undefined;
  comment?: string | undefined;
  createTime?: string | undefined;
  updateTime?: string | undefined;
  reviewReply?: GoogleReviewReply | undefined;
  reviewMediaItems?: Array<Record<string, unknown>> | undefined;
  reviewReplyUrl?: string | undefined;
};

export type GoogleReviewPage = {
  reviews: GoogleReview[];
  nextPageToken?: string | undefined;
  totalReviewCount?: number | undefined;
  averageRating?: number | undefined;
};

export type GoogleReplyUpdateResult =
  | { status: 'CONFIRMED'; reply: GoogleReviewReply }
  | { status: 'UNKNOWN' };

type ClientOptions = {
  timeoutMs: number;
  fetcher?: typeof fetch | undefined;
};

function providerError(status: number): ProviderAdapterError {
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
      code: 'GOOGLE_REVIEWS_ACCESS_DENIED',
      message: 'Google не разрешил работу с отзывами для выбранной локации. Проверьте доступ, верификацию профиля и API quota.',
      statusCode: 403,
      retryable: false,
    });
  }
  if (status === 404) {
    return new ProviderAdapterError({
      code: 'GOOGLE_REVIEWS_LOCATION_NOT_FOUND',
      message: 'Выбранный Google Business Profile review/location недоступен или больше не существует.',
      statusCode: 404,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ProviderAdapterError({
      code: 'GOOGLE_REVIEWS_RATE_LIMITED',
      message: 'Google временно ограничил частоту запросов к отзывам.',
      statusCode: 429,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new ProviderAdapterError({
      code: 'GOOGLE_REVIEWS_UPSTREAM_UNAVAILABLE',
      message: 'Google Reviews API временно недоступен.',
      statusCode: 503,
      retryable: true,
    });
  }
  return new ProviderAdapterError({
    code: 'GOOGLE_REVIEWS_REQUEST_FAILED',
    message: 'Не удалось выполнить запрос Google Reviews API.',
    statusCode: 502,
    retryable: false,
  });
}

function validParent(value: string): boolean {
  return /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/.test(value);
}

function validReviewName(value: string): boolean {
  return /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/reviews\/[A-Za-z0-9_-]+$/.test(value);
}

export class GoogleBusinessReviewsClient {
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: ClientOptions) {
    this.timeoutMs = options.timeoutMs;
    this.fetcher = options.fetcher ?? fetch;
  }

  async listReviewsPage(accessToken: string, parent: string, pageToken = ''): Promise<GoogleReviewPage> {
    if (!validParent(parent)) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REVIEW_PARENT_INVALID',
        message: 'Некорректный Google Business Profile review parent.',
        statusCode: 400,
      });
    }

    const url = new URL(`${GOOGLE_MY_BUSINESS_V4}/${parent}/reviews`);
    url.searchParams.set('pageSize', String(MAX_PAGE_SIZE));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REVIEWS_UPSTREAM_UNAVAILABLE',
        message: 'Не удалось связаться с Google Reviews API.',
        statusCode: 503,
        retryable: true,
        cause: error,
      });
    }

    if (!response.ok) throw providerError(response.status);

    let payload: Record<string, unknown>;
    try {
      payload = await response.json() as Record<string, unknown>;
    } catch (error) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REVIEWS_RESPONSE_INVALID',
        message: 'Google Reviews API вернул некорректный ответ.',
        statusCode: 502,
        retryable: false,
        cause: error,
      });
    }

    return {
      reviews: Array.isArray(payload.reviews) ? payload.reviews as GoogleReview[] : [],
      nextPageToken: typeof payload.nextPageToken === 'string' && payload.nextPageToken ? payload.nextPageToken : undefined,
      totalReviewCount: typeof payload.totalReviewCount === 'number' ? payload.totalReviewCount : undefined,
      averageRating: typeof payload.averageRating === 'number' ? payload.averageRating : undefined,
    };
  }

  async getReview(accessToken: string, name: string): Promise<GoogleReview> {
    if (!validReviewName(name)) {
      throw new ProviderAdapterError({ code: 'GOOGLE_REVIEW_NAME_INVALID', message: 'Некорректный Google review resource name.', statusCode: 400 });
    }
    let response: Response;
    try {
      response = await this.fetcher(`${GOOGLE_MY_BUSINESS_V4}/${name}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ProviderAdapterError({ code: 'GOOGLE_REVIEWS_UPSTREAM_UNAVAILABLE', message: 'Не удалось проверить состояние ответа Google.', statusCode: 503, retryable: true, cause: error });
    }
    if (!response.ok) throw providerError(response.status);
    try {
      return await response.json() as GoogleReview;
    } catch (error) {
      throw new ProviderAdapterError({ code: 'GOOGLE_REVIEWS_RESPONSE_INVALID', message: 'Google Reviews API вернул некорректный review.', statusCode: 502, retryable: true, cause: error });
    }
  }

  async updateReply(accessToken: string, name: string, comment: string): Promise<GoogleReplyUpdateResult> {
    if (!validReviewName(name)) {
      throw new ProviderAdapterError({ code: 'GOOGLE_REVIEW_NAME_INVALID', message: 'Некорректный Google review resource name.', statusCode: 400 });
    }
    let response: Response;
    try {
      response = await this.fetcher(`${GOOGLE_MY_BUSINESS_V4}/${name}/reply`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ comment }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // A network/timeout failure after sending a mutation does not prove whether
      // Google applied the reply. The caller must reconcile before claiming failure.
      return { status: 'UNKNOWN' };
    }

    if (response.status >= 500 || response.status === 408) return { status: 'UNKNOWN' };
    if (!response.ok) throw providerError(response.status);
    try {
      return { status: 'CONFIRMED', reply: await response.json() as GoogleReviewReply };
    } catch {
      // 2xx with an unreadable body still means the external write may have happened.
      return { status: 'UNKNOWN' };
    }
  }
}

export function googleStarRating(value: string | undefined): number | null {
  const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return value ? map[value] ?? null : null;
}
