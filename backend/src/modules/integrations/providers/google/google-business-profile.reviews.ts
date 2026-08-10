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
  policyViolation?: string | undefined;
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
      message: 'Google не разрешил чтение отзывов для выбранной локации. Проверьте доступ, верификацию профиля и API quota.',
      statusCode: 403,
      retryable: false,
    });
  }
  if (status === 404) {
    return new ProviderAdapterError({
      code: 'GOOGLE_REVIEWS_LOCATION_NOT_FOUND',
      message: 'Выбранная Google Business Profile локация недоступна или больше не существует.',
      statusCode: 404,
      retryable: false,
    });
  }
  if (status === 429) {
    return new ProviderAdapterError({
      code: 'GOOGLE_REVIEWS_RATE_LIMITED',
      message: 'Google временно ограничил частоту чтения отзывов.',
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
    message: 'Не удалось получить отзывы Google Business Profile.',
    statusCode: 502,
    retryable: false,
  });
}

function validParent(value: string): boolean {
  return /^accounts\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+$/.test(value);
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
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
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
}

export function googleStarRating(value: string | undefined): number | null {
  const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return value ? map[value] ?? null : null;
}
