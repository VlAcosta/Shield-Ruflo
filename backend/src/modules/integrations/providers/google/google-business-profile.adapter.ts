import { env } from '../../../../config/env.js';
import { ProviderAdapterError } from '../provider.errors.js';
import type {
  ProviderAdapter,
  ProviderConnectionContext,
  ProviderReplyInput,
  ProviderReplyReconciliationResult,
  ProviderReplyResult,
  ProviderReviewRecord,
  ProviderReviewSyncResult,
} from '../provider.types.js';
import {
  GoogleBusinessProfileClient,
  type GoogleBusinessAccount,
  type GoogleBusinessLocation,
} from './google-business-profile.client.js';
import {
  GoogleBusinessReviewsClient,
  googleStarRating,
  type GoogleReview,
} from './google-business-profile.reviews.js';

export const GOOGLE_BUSINESS_PROVIDER_ID = 'google-business-profile';

type ReviewCursor = {
  locationIndex: number;
  pageToken: string;
};

type CachedAccessToken = {
  token: string;
  expiresAt: number;
};

const accessTokenCache = new Map<string, CachedAccessToken>();

function configured(): boolean {
  return env.GOOGLE_BUSINESS_ENABLED
    && Boolean(env.GOOGLE_BUSINESS_CLIENT_ID)
    && Boolean(env.GOOGLE_BUSINESS_CLIENT_SECRET)
    && Boolean(env.GOOGLE_BUSINESS_REDIRECT_URI);
}

export function googleBusinessProfileClient(): GoogleBusinessProfileClient {
  return new GoogleBusinessProfileClient({
    clientId: env.GOOGLE_BUSINESS_CLIENT_ID,
    clientSecret: env.GOOGLE_BUSINESS_CLIENT_SECRET,
    redirectUri: env.GOOGLE_BUSINESS_REDIRECT_URI,
    timeoutMs: env.GOOGLE_BUSINESS_TIMEOUT_MS,
  });
}

function googleBusinessReviewsClient(): GoogleBusinessReviewsClient {
  return new GoogleBusinessReviewsClient({ timeoutMs: env.GOOGLE_BUSINESS_TIMEOUT_MS });
}

function selectedAccountName(context: ProviderConnectionContext): string | null {
  const value = context.configuration.googleAccountName;
  return typeof value === 'string' && /^accounts\/[^/]+$/.test(value) ? value : null;
}

function selectedLocationNames(context: ProviderConnectionContext): string[] {
  const value = context.configuration.googleSelectedLocationNames;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => (
    typeof item === 'string' && /^locations\/[A-Za-z0-9_-]+$/.test(item)
  )))];
}

function selectedLocationTitle(context: ProviderConnectionContext, locationName: string): string | undefined {
  const value = context.configuration.googleSelectedLocations;
  if (!Array.isArray(value)) return undefined;
  const item = value.find((candidate) => (
    candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    && (candidate as Record<string, unknown>).name === locationName
  ));
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const title = (item as Record<string, unknown>).title;
  return typeof title === 'string' && title.trim() ? title : undefined;
}

function publicAccount(account: GoogleBusinessAccount) {
  return {
    name: account.name,
    accountName: account.accountName ?? null,
    type: account.type ?? null,
    role: account.role ?? null,
    verificationState: account.verificationState ?? null,
    vettedState: account.vettedState ?? null,
  };
}

function encodeCursor(cursor: ReviewCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string | undefined, locationCount: number): ReviewCursor {
  if (!value) return { locationIndex: 0, pageToken: '' };
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<ReviewCursor>;
    if (
      !Number.isInteger(parsed.locationIndex)
      || Number(parsed.locationIndex) < 0
      || Number(parsed.locationIndex) >= locationCount
      || typeof parsed.pageToken !== 'string'
      || parsed.pageToken.length > 4096
    ) throw new Error('invalid cursor');
    return { locationIndex: Number(parsed.locationIndex), pageToken: parsed.pageToken };
  } catch {
    throw new ProviderAdapterError({
      code: 'GOOGLE_REVIEW_CURSOR_INVALID',
      message: 'Некорректный cursor синхронизации Google Reviews.',
      statusCode: 400,
      retryable: false,
    });
  }
}

function dateValue(value: string | undefined): Date {
  return new Date(value || '');
}

function providerReview(
  review: GoogleReview,
  accountName: string,
  locationName: string,
  locationTitle?: string,
): ProviderReviewRecord | null {
  if (!review.reviewId) return null;
  const anonymous = review.reviewer?.isAnonymous === true;
  return {
    externalId: review.reviewId,
    rating: googleStarRating(review.starRating) ?? 0,
    text: review.comment || '',
    authorName: anonymous ? 'Анонимный пользователь Google' : (review.reviewer?.displayName || 'Пользователь Google'),
    authorExternalId: `google-review:${review.reviewId}:reviewer`,
    authorAvatarUrl: anonymous ? undefined : review.reviewer?.profilePhotoUrl,
    publishedAt: dateValue(review.createTime),
    providerUpdatedAt: dateValue(review.updateTime || review.createTime),
    providerLocationId: locationName,
    providerLocationName: locationTitle,
    raw: {
      providerReviewName: review.name ?? null,
      googleAccountName: accountName,
      googleLocationName: locationName,
      starRating: review.starRating ?? null,
      reviewReply: review.reviewReply ?? null,
      reviewMediaItems: review.reviewMediaItems ?? [],
      reviewReplyUrl: review.reviewReplyUrl ?? null,
    },
  };
}

async function accessToken(context: ProviderConnectionContext): Promise<string> {
  const cached = accessTokenCache.get(context.accountId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const refreshToken = context.credentials.refreshToken;
  if (!refreshToken) {
    throw new ProviderAdapterError({
      code: 'GOOGLE_REFRESH_TOKEN_MISSING',
      message: 'Google OAuth refresh token отсутствует. Подключите Google Business Profile заново.',
      statusCode: 409,
      retryable: false,
    });
  }
  const token = await googleBusinessProfileClient().refreshAccessToken(refreshToken);
  accessTokenCache.set(context.accountId, {
    token: token.accessToken,
    expiresAt: Date.now() + Math.max(60, token.expiresIn ?? 3600) * 1000,
  });
  return token.accessToken;
}

export class GoogleBusinessProfileAdapter implements ProviderAdapter {
  readonly id = GOOGLE_BUSINESS_PROVIDER_ID;
  readonly displayName = 'Google Business Profile';
  readonly capabilities = ['oauth', 'accounts.read', 'locations.read', 'profile.read', 'reviews.read', 'reviews.reply'] as const;

  availability() {
    if (!env.GOOGLE_BUSINESS_ENABLED) {
      return {
        configured: false,
        connectable: false,
        reasonCode: 'GOOGLE_BUSINESS_DISABLED',
        reasonMessage: 'Google Business Profile отключён в конфигурации сервера.',
      };
    }
    if (!configured()) {
      return {
        configured: false,
        connectable: false,
        reasonCode: 'GOOGLE_BUSINESS_NOT_CONFIGURED',
        reasonMessage: 'OAuth credentials Google Business Profile не настроены.',
      };
    }
    return { configured: true, connectable: true };
  }

  async connect(context: ProviderConnectionContext) {
    const refreshToken = context.credentials.refreshToken;
    if (!refreshToken) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REFRESH_TOKEN_MISSING',
        message: 'Google OAuth ещё не завершён или refresh token отсутствует.',
        statusCode: 409,
        retryable: false,
      });
    }

    const client = googleBusinessProfileClient();
    const token = await client.refreshAccessToken(refreshToken);
    accessTokenCache.set(context.accountId, {
      token: token.accessToken,
      expiresAt: Date.now() + Math.max(60, token.expiresIn ?? 3600) * 1000,
    });
    const accounts = await client.listAccounts(token.accessToken);
    if (!accounts.length) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_BUSINESS_NO_ACCOUNTS',
        message: 'В Google аккаунте нет доступных Business Profile accounts.',
        statusCode: 422,
        retryable: false,
      });
    }

    const selected = selectedAccountName(context);
    if (!selected) {
      return {
        verified: true as const,
        health: 'DEGRADED' as const,
        configuration: {
          googleSetupState: 'ACCOUNT_SELECTION_REQUIRED',
          googleAccounts: accounts.map(publicAccount),
        },
      };
    }

    const account = accounts.find((item) => item.name === selected);
    if (!account) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_BUSINESS_ACCOUNT_NOT_ACCESSIBLE',
        message: 'Выбранный Google Business Profile account больше недоступен текущей авторизации.',
        statusCode: 403,
        retryable: false,
      });
    }

    const locations = await client.listLocations(token.accessToken, selected);
    return {
      verified: true as const,
      health: 'CONNECTED' as const,
      externalAccountId: selected,
      configuration: {
        googleSetupState: 'READY',
        googleAccountName: selected,
        googleAccount: publicAccount(account),
        googleLocations: locations.map((location) => ({
          name: location.name,
          title: location.title ?? null,
          storeCode: location.storeCode ?? null,
        })),
        googleLocationCount: locations.length,
      },
    };
  }

  async syncReviews(context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult> {
    const accountName = selectedAccountName(context);
    const locations = selectedLocationNames(context);
    if (!accountName || !locations.length) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REVIEW_SELECTION_REQUIRED',
        message: 'Перед синхронизацией отзывов выберите Google Business account и локации.',
        statusCode: 409,
        retryable: false,
      });
    }

    const position = decodeCursor(cursor, locations.length);
    const locationName = locations[position.locationIndex]!;
    const page = await googleBusinessReviewsClient().listReviewsPage(
      await accessToken(context),
      `${accountName}/${locationName}`,
      position.pageToken,
    );
    const records = page.reviews
      .map((review) => providerReview(review, accountName, locationName, selectedLocationTitle(context, locationName)))
      .filter((review): review is ProviderReviewRecord => Boolean(review));

    if (page.nextPageToken) {
      return {
        reviews: records,
        hasMore: true,
        nextCursor: encodeCursor({ locationIndex: position.locationIndex, pageToken: page.nextPageToken }),
      };
    }
    const nextLocationIndex = position.locationIndex + 1;
    if (nextLocationIndex < locations.length) {
      return {
        reviews: records,
        hasMore: true,
        nextCursor: encodeCursor({ locationIndex: nextLocationIndex, pageToken: '' }),
      };
    }
    return { reviews: records, hasMore: false };
  }

  async publishReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyResult> {
    const result = await googleBusinessReviewsClient().updateReply(
      await accessToken(context),
      input.reviewReference,
      input.text,
    );
    if (result.status === 'UNKNOWN') return { status: 'UNKNOWN' };
    const reply = result.reply;
    return {
      status: 'CONFIRMED',
      externalReplyId: `${input.reviewReference}/reply`,
      ...(reply.reviewReplyState ? { providerState: reply.reviewReplyState } : {}),
      ...(reply.policyViolation !== undefined ? { policyViolation: reply.policyViolation } : {}),
    };
  }

  async reconcileReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyReconciliationResult> {
    const review = await googleBusinessReviewsClient().getReview(await accessToken(context), input.reviewReference);
    if (review.reviewReply?.comment !== input.text) return { status: 'ABSENT' };
    return {
      status: 'CONFIRMED',
      externalReplyId: `${input.reviewReference}/reply`,
      ...(review.reviewReply.reviewReplyState ? { providerState: review.reviewReply.reviewReplyState } : {}),
      ...(review.reviewReply.policyViolation !== undefined ? { policyViolation: review.reviewReply.policyViolation } : {}),
    };
  }

  async disconnect(context: ProviderConnectionContext) {
    const refreshToken = context.credentials.refreshToken;
    if (!refreshToken) {
      throw new ProviderAdapterError({
        code: 'GOOGLE_REFRESH_TOKEN_MISSING',
        message: 'Нельзя подтвердить отзыв доступа Google: refresh token отсутствует.',
        statusCode: 409,
        retryable: false,
      });
    }
    await googleBusinessProfileClient().revokeToken(refreshToken);
    accessTokenCache.delete(context.accountId);
    return { confirmed: true };
  }
}

export async function listGoogleBusinessAccounts(refreshToken: string): Promise<GoogleBusinessAccount[]> {
  const client = googleBusinessProfileClient();
  const token = await client.refreshAccessToken(refreshToken);
  return client.listAccounts(token.accessToken);
}

export async function listGoogleBusinessLocations(
  refreshToken: string,
  accountName: string,
): Promise<GoogleBusinessLocation[]> {
  const client = googleBusinessProfileClient();
  const token = await client.refreshAccessToken(refreshToken);
  return client.listLocations(token.accessToken, accountName);
}
