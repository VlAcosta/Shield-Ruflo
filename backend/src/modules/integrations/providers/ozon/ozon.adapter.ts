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

const DEFAULT_BASE_URL = 'https://api-seller.ozon.ru';
const DEFAULT_LIST_PATH = '/v1/review/list';
const DEFAULT_COMMENT_CREATE_PATH = '/v1/review/comment/create';
const DEFAULT_COMMENT_LIST_PATH = '/v1/review/comment/list';
const PAGE_SIZE = 100;

type OzonReview = {
  id?: string;
  review_id?: string;
  score?: number;
  rating?: number;
  text?: string;
  content?: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
  sku?: number | string;
  product_id?: number | string;
  product_name?: string;
  author_name?: string;
  author?: string;
};

type OzonListResponse = {
  result?: { reviews?: OzonReview[]; last_id?: string; has_next?: boolean };
  reviews?: OzonReview[];
  last_id?: string;
  has_next?: boolean;
};

type OzonComment = { id?: string; comment_id?: string; text?: string; created_at?: string };
type OzonCommentResponse = { result?: { comments?: OzonComment[] }; comments?: OzonComment[] };

function baseUrl(context: ProviderConnectionContext): string {
  return (configString(context.configuration, 'apiBaseUrl') || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function apiPath(context: ProviderConnectionContext, key: string, fallback: string): string {
  const value = configString(context.configuration, key) || fallback;
  return value.startsWith('/') ? value : `/${value}`;
}

function headers(context: ProviderConnectionContext): HeadersInit {
  return {
    'Client-Id': requireCredential(context.credentials, 'clientId', 'ozon'),
    'Api-Key': requireCredential(context.credentials, 'apiKey', 'ozon'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function endpoint(context: ProviderConnectionContext, key: string, fallback: string): string {
  return `${baseUrl(context)}${apiPath(context, key, fallback)}`;
}

function safeDate(value?: string): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function mapReview(review: OzonReview): ProviderReviewRecord | null {
  const externalId = String(review.id || review.review_id || '').trim();
  const rating = Number(review.score ?? review.rating);
  if (!externalId || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const productId = String(review.sku ?? review.product_id ?? '').trim();
  return {
    externalId,
    rating,
    text: String(review.text ?? review.content ?? ''),
    authorName: String(review.author_name ?? review.author ?? 'Покупатель Ozon'),
    authorExternalId: `ozon:${externalId}:author`,
    publishedAt: safeDate(review.published_at ?? review.created_at),
    providerUpdatedAt: review.updated_at ? safeDate(review.updated_at) : undefined,
    providerLocationId: productId || undefined,
    providerLocationName: review.product_name || (productId ? `Ozon ${productId}` : undefined),
    raw: { sku: review.sku ?? null, productId: review.product_id ?? null },
  };
}

function reviewsFrom(payload: OzonListResponse): OzonReview[] {
  return payload.result?.reviews ?? payload.reviews ?? [];
}

function nextIdFrom(payload: OzonListResponse): string {
  return String(payload.result?.last_id ?? payload.last_id ?? '').trim();
}

function hasNext(payload: OzonListResponse, reviewCount: number): boolean {
  const explicit = payload.result?.has_next ?? payload.has_next;
  return typeof explicit === 'boolean' ? explicit : reviewCount >= PAGE_SIZE;
}

export class OzonProviderAdapter implements ProviderAdapter {
  readonly id = 'ozon';
  readonly displayName = 'Ozon';
  readonly capabilities = ['reviews.read', 'reviews.reply'] as const;

  availability() {
    return { configured: true, connectable: true };
  }

  async connect(context: ProviderConnectionContext) {
    const payload = await providerFetchJson<OzonListResponse>(endpoint(context, 'reviewListPath', DEFAULT_LIST_PATH), {
      method: 'POST',
      headers: headers(context),
      body: JSON.stringify({ limit: 1, sort_dir: 'DESC', status: 'ALL' }),
    }, { provider: 'ozon' });
    reviewsFrom(payload);
    return {
      verified: true as const,
      health: 'CONNECTED' as const,
      externalAccountId: context.externalAccountId || requireCredential(context.credentials, 'clientId', 'ozon'),
      configuration: {
        apiBaseUrl: baseUrl(context),
        reviewListPath: apiPath(context, 'reviewListPath', DEFAULT_LIST_PATH),
        commentCreatePath: apiPath(context, 'commentCreatePath', DEFAULT_COMMENT_CREATE_PATH),
        commentListPath: apiPath(context, 'commentListPath', DEFAULT_COMMENT_LIST_PATH),
        syncEnabled: true,
      },
      validatedAt: new Date(),
    };
  }

  async disconnect() {
    return { confirmed: true };
  }

  async syncReviews(context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult> {
    const body: Record<string, unknown> = { limit: PAGE_SIZE, sort_dir: 'DESC', status: 'ALL' };
    if (cursor) body.last_id = cursor;
    const payload = await providerFetchJson<OzonListResponse>(endpoint(context, 'reviewListPath', DEFAULT_LIST_PATH), {
      method: 'POST',
      headers: headers(context),
      body: JSON.stringify(body),
    }, { provider: 'ozon' });
    const rawReviews = reviewsFrom(payload);
    const reviews = rawReviews.map(mapReview).filter((item): item is ProviderReviewRecord => Boolean(item));
    const nextCursor = nextIdFrom(payload);
    const more = hasNext(payload, rawReviews.length) && Boolean(nextCursor) && nextCursor !== cursor;
    return { reviews, hasMore: more, ...(more ? { nextCursor } : {}) };
  }

  async publishReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyResult> {
    const text = input.text.trim();
    if (!text || text.length > 5000) {
      throw new ProviderAdapterError({
        code: 'OZON_REPLY_INVALID',
        message: 'Ozon: ответ пустой или превышает допустимую длину',
        statusCode: 422,
        retryable: false,
      });
    }
    const payload = await providerFetchJson<Record<string, any>>(endpoint(context, 'commentCreatePath', DEFAULT_COMMENT_CREATE_PATH), {
      method: 'POST',
      headers: headers(context),
      body: JSON.stringify({ review_id: input.reviewReference, text }),
    }, { provider: 'ozon' });
    const externalReplyId = String(payload?.result?.comment_id ?? payload?.result?.id ?? payload?.comment_id ?? payload?.id ?? '').trim();
    return {
      status: externalReplyId ? 'CONFIRMED' : 'UNKNOWN',
      ...(externalReplyId ? { externalReplyId } : {}),
      providerState: externalReplyId ? 'COMMENT_CREATED' : 'COMMENT_CREATE_ACCEPTED',
    };
  }

  async reconcileReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyReconciliationResult> {
    const payload = await providerFetchJson<OzonCommentResponse>(endpoint(context, 'commentListPath', DEFAULT_COMMENT_LIST_PATH), {
      method: 'POST',
      headers: headers(context),
      body: JSON.stringify({ review_id: input.reviewReference, limit: 100, offset: 0 }),
    }, { provider: 'ozon' });
    const comments = payload.result?.comments ?? payload.comments ?? [];
    const expected = input.text.trim();
    const match = comments.find((comment) => String(comment.text || '').trim() === expected);
    if (!match) return { status: comments.length ? 'UNKNOWN' : 'ABSENT', providerState: comments.length ? 'COMMENTS_PRESENT' : 'NO_COMMENTS' };
    return {
      status: 'CONFIRMED',
      externalReplyId: String(match.id ?? match.comment_id ?? `ozon-comment:${input.reviewReference}`),
      providerState: 'COMMENT_PRESENT',
    };
  }
}
