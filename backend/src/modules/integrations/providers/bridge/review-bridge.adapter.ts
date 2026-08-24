import type {
  ProviderAdapter,
  ProviderConnectionContext,
  ProviderReplyInput,
  ProviderReplyReconciliationResult,
  ProviderReplyResult,
  ProviderReviewRecord,
  ProviderReviewSyncResult,
} from '../provider.types.js';
import { configString, providerFetchJson, requireCredential } from '../provider-http.js';
import { ProviderAdapterError } from '../provider.errors.js';

export type ReviewBridgeProviderId = 'yandex' | 'otzovik';

type BridgeHealth = {
  ok?: boolean;
  provider?: string;
  externalAccountId?: string;
  capabilities?: string[];
};

type BridgeReview = {
  id?: string;
  rating?: number;
  text?: string;
  title?: string;
  author?: { id?: string; name?: string; avatarUrl?: string; profileUrl?: string };
  publishedAt?: string;
  updatedAt?: string;
  location?: { id?: string; name?: string };
  sourceUrl?: string;
  raw?: Record<string, unknown>;
};

type BridgeReviews = { reviews?: BridgeReview[]; nextCursor?: string | null; hasMore?: boolean };
type BridgeReply = { status?: string; externalReplyId?: string; providerState?: string };

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new ProviderAdapterError({
      code: 'REVIEW_BRIDGE_HTTPS_REQUIRED',
      message: 'Production review bridge должен использовать HTTPS',
      statusCode: 422,
      retryable: false,
    });
  }
  return url.toString().replace(/\/$/, '');
}

function bridgeBaseUrl(context: ProviderConnectionContext): string {
  const value = configString(context.configuration, 'bridgeBaseUrl');
  if (!value) {
    throw new ProviderAdapterError({
      code: 'REVIEW_BRIDGE_URL_REQUIRED',
      message: 'Не указан URL verified review bridge',
      statusCode: 422,
      retryable: false,
    });
  }
  try {
    return normalizeBaseUrl(value);
  } catch (error) {
    if (error instanceof ProviderAdapterError) throw error;
    throw new ProviderAdapterError({
      code: 'REVIEW_BRIDGE_URL_INVALID',
      message: 'Некорректный URL review bridge',
      statusCode: 422,
      retryable: false,
      cause: error,
    });
  }
}

function bridgeHeaders(context: ProviderConnectionContext): HeadersInit {
  return {
    Authorization: `Bearer ${requireCredential(context.credentials, 'bridgeToken', 'review-bridge')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function externalId(context: ProviderConnectionContext): string {
  const value = configString(context.configuration, 'externalId') || String(context.externalAccountId || '').trim();
  if (!value) {
    throw new ProviderAdapterError({
      code: 'REVIEW_BRIDGE_EXTERNAL_ID_REQUIRED',
      message: 'Не указан внешний ID организации для review bridge',
      statusCode: 422,
      retryable: false,
    });
  }
  return value;
}

function validDate(value?: string): Date {
  const result = value ? new Date(value) : new Date();
  return Number.isFinite(result.getTime()) ? result : new Date();
}

function mapReview(review: BridgeReview): ProviderReviewRecord | null {
  const id = String(review.id || '').trim();
  const rating = Number(review.rating);
  if (!id || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return {
    externalId: id,
    rating,
    text: String(review.text || ''),
    title: review.title,
    authorExternalId: review.author?.id,
    authorName: review.author?.name,
    authorAvatarUrl: review.author?.avatarUrl,
    authorProfileUrl: review.author?.profileUrl,
    publishedAt: validDate(review.publishedAt),
    providerUpdatedAt: review.updatedAt ? validDate(review.updatedAt) : undefined,
    providerLocationId: review.location?.id,
    providerLocationName: review.location?.name,
    sourceUrl: review.sourceUrl,
    raw: review.raw,
  };
}

export class ReviewBridgeProviderAdapter implements ProviderAdapter {
  readonly capabilities = ['reviews.read', 'reviews.reply'] as const;

  constructor(
    readonly id: ReviewBridgeProviderId,
    readonly displayName: string,
  ) {}

  availability() {
    return { configured: true, connectable: true };
  }

  private path(context: ProviderConnectionContext, suffix: string): string {
    return `${bridgeBaseUrl(context)}/v1/providers/${encodeURIComponent(this.id)}${suffix}`;
  }

  async connect(context: ProviderConnectionContext) {
    const accountId = externalId(context);
    const query = new URLSearchParams({ externalId: accountId });
    const health = await providerFetchJson<BridgeHealth>(`${this.path(context, '/health')}?${query}`, {
      method: 'GET',
      headers: bridgeHeaders(context),
    }, { provider: `${this.id}-bridge` });
    if (health.ok !== true) {
      throw new ProviderAdapterError({
        code: `${this.id.toUpperCase()}_BRIDGE_NOT_VERIFIED`,
        message: `${this.displayName}: bridge не подтвердил доступ к организации`,
        statusCode: 422,
        retryable: false,
      });
    }
    const capabilities = new Set(health.capabilities ?? []);
    if (!capabilities.has('reviews.read')) {
      throw new ProviderAdapterError({
        code: `${this.id.toUpperCase()}_BRIDGE_REVIEW_READ_REQUIRED`,
        message: `${this.displayName}: bridge не подтвердил capability reviews.read`,
        statusCode: 422,
        retryable: false,
      });
    }
    return {
      verified: true as const,
      health: capabilities.has('reviews.reply') ? 'CONNECTED' as const : 'DEGRADED' as const,
      externalAccountId: health.externalAccountId || accountId,
      configuration: {
        bridgeBaseUrl: bridgeBaseUrl(context),
        externalId: health.externalAccountId || accountId,
        bridgeCapabilities: [...capabilities],
        syncEnabled: true,
      },
      validatedAt: new Date(),
    };
  }

  async disconnect() {
    return { confirmed: true };
  }

  async syncReviews(context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult> {
    const query = new URLSearchParams({ externalId: externalId(context), limit: '200' });
    if (cursor) query.set('cursor', cursor);
    const payload = await providerFetchJson<BridgeReviews>(`${this.path(context, '/reviews')}?${query}`, {
      method: 'GET',
      headers: bridgeHeaders(context),
    }, { provider: `${this.id}-bridge` });
    const reviews = (payload.reviews ?? []).map(mapReview).filter((item): item is ProviderReviewRecord => Boolean(item));
    const nextCursor = String(payload.nextCursor || '').trim();
    const hasMore = Boolean(payload.hasMore && nextCursor && nextCursor !== cursor);
    return { reviews, hasMore, ...(hasMore ? { nextCursor } : {}) };
  }

  async publishReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyResult> {
    const payload = await providerFetchJson<BridgeReply>(this.path(context, `/reviews/${encodeURIComponent(input.reviewReference)}/reply`), {
      method: 'POST',
      headers: bridgeHeaders(context),
      body: JSON.stringify({ externalId: externalId(context), text: input.text }),
    }, { provider: `${this.id}-bridge` });
    const status = String(payload.status || '').toUpperCase();
    return {
      status: status === 'CONFIRMED' ? 'CONFIRMED' : 'UNKNOWN',
      ...(payload.externalReplyId ? { externalReplyId: payload.externalReplyId } : {}),
      ...(payload.providerState ? { providerState: payload.providerState } : {}),
    };
  }

  async reconcileReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyReconciliationResult> {
    const query = new URLSearchParams({ externalId: externalId(context), textHashInput: input.text });
    const payload = await providerFetchJson<BridgeReply>(`${this.path(context, `/reviews/${encodeURIComponent(input.reviewReference)}/reply`)}?${query}`, {
      method: 'GET',
      headers: bridgeHeaders(context),
    }, { provider: `${this.id}-bridge` });
    const status = String(payload.status || '').toUpperCase();
    return {
      status: status === 'CONFIRMED' ? 'CONFIRMED' : status === 'ABSENT' ? 'ABSENT' : 'UNKNOWN',
      ...(payload.externalReplyId ? { externalReplyId: payload.externalReplyId } : {}),
      ...(payload.providerState ? { providerState: payload.providerState } : {}),
    };
  }
}
