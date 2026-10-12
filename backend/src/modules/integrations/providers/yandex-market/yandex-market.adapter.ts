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

const DEFAULT_BASE_URL = 'https://api.partner.market.yandex.ru';
const PAGE_SIZE = 50;

type MarketFeedback = {
  feedbackId?: number;
  createdAt?: string;
  needReaction?: boolean;
  identifiers?: { orderId?: number; offerId?: string };
  author?: string;
  description?: { advantages?: string; disadvantages?: string; comment?: string };
  media?: { photos?: string[]; videos?: string[] };
  statistics?: { rating?: number; commentsCount?: number; recommended?: boolean; paidAmount?: number };
};

type MarketFeedbackResponse = {
  status?: string;
  errors?: Array<{ code?: string; message?: string }>;
  result?: {
    feedbacks?: MarketFeedback[];
    paging?: { nextPageToken?: string };
  };
};

type MarketComment = {
  id?: number;
  text?: string;
  canModify?: boolean;
  parentId?: number;
  author?: { type?: 'USER' | 'BUSINESS' | 'BRAND'; name?: string };
  status?: 'PUBLISHED' | 'UNMODERATED' | 'BANNED' | 'DELETED';
  feedbackId?: number;
};

type MarketCommentResponse = {
  status?: string;
  errors?: Array<{ code?: string; message?: string }>;
  result?: MarketComment | {
    comments?: MarketComment[];
    paging?: { nextPageToken?: string };
  };
};

function baseUrl(context: ProviderConnectionContext): string {
  return (configString(context.configuration, 'apiBaseUrl') || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function businessId(context: ProviderConnectionContext): string {
  const value = configString(context.configuration, 'businessId')
    || String(context.externalAccountId || '').trim();
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new ProviderAdapterError({
      code: 'YANDEX_MARKET_BUSINESS_ID_REQUIRED',
      message: 'Яндекс Маркет: укажите числовой businessId кабинета продавца',
      statusCode: 422,
      retryable: false,
    });
  }
  return value;
}

function headers(context: ProviderConnectionContext): HeadersInit {
  return {
    'Api-Key': requireCredential(context.credentials, 'apiKey', 'yandex-market'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function assertOk(payload: { status?: string; errors?: Array<{ code?: string; message?: string }> }) {
  if (String(payload.status || '').toUpperCase() === 'OK') return;
  const first = payload.errors?.[0];
  throw new ProviderAdapterError({
    code: first?.code || 'YANDEX_MARKET_API_ERROR',
    message: first?.message || 'Яндекс Маркет API вернул ошибку',
    statusCode: 502,
    retryable: true,
  });
}

function validDate(value?: string): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function reviewText(feedback: MarketFeedback): string {
  const parts = [
    feedback.description?.advantages ? `Достоинства: ${feedback.description.advantages}` : '',
    feedback.description?.disadvantages ? `Недостатки: ${feedback.description.disadvantages}` : '',
    feedback.description?.comment ? feedback.description.comment : '',
  ].filter(Boolean);
  return parts.join('\n').trim();
}

function mapFeedback(feedback: MarketFeedback): ProviderReviewRecord | null {
  const id = Number(feedback.feedbackId);
  const rating = Number(feedback.statistics?.rating);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const offerId = String(feedback.identifiers?.offerId || '').trim();

  return {
    externalId: String(id),
    rating,
    text: reviewText(feedback),
    authorName: String(feedback.author || 'Покупатель Яндекс Маркета'),
    authorExternalId: `yandex-market:${id}:author`,
    publishedAt: validDate(feedback.createdAt),
    ...(offerId ? { providerLocationId: offerId, providerLocationName: offerId } : {}),
    raw: {
      needReaction: Boolean(feedback.needReaction),
      offerId: offerId || null,
      orderId: feedback.identifiers?.orderId ?? null,
      commentsCount: feedback.statistics?.commentsCount ?? null,
      recommended: feedback.statistics?.recommended ?? null,
      paidAmount: feedback.statistics?.paidAmount ?? null,
      media: feedback.media ?? null,
    },
  };
}

function feedbackUrl(context: ProviderConnectionContext, suffix = ''): string {
  return `${baseUrl(context)}/v2/businesses/${encodeURIComponent(businessId(context))}/goods-feedback${suffix}`;
}

export class YandexMarketProviderAdapter implements ProviderAdapter {
  readonly id = 'yandex-market';
  readonly displayName = 'Яндекс Маркет';
  readonly capabilities = ['reviews.read', 'reviews.reply'] as const;

  availability() {
    return { configured: true, connectable: true };
  }

  async connect(context: ProviderConnectionContext) {
    const payload = await providerFetchJson<MarketFeedbackResponse>(
      `${feedbackUrl(context)}?limit=1`,
      {
        method: 'POST',
        headers: headers(context),
        body: JSON.stringify({ reactionStatus: 'ALL' }),
      },
      { provider: 'yandex-market' },
    );
    assertOk(payload);
    return {
      verified: true as const,
      health: 'CONNECTED' as const,
      externalAccountId: businessId(context),
      configuration: {
        apiBaseUrl: baseUrl(context),
        businessId: businessId(context),
        syncEnabled: true,
      },
      validatedAt: new Date(),
    };
  }

  async disconnect() {
    return { confirmed: true };
  }

  async syncReviews(context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult> {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) query.set('pageToken', cursor);
    const payload = await providerFetchJson<MarketFeedbackResponse>(
      `${feedbackUrl(context)}?${query}`,
      {
        method: 'POST',
        headers: headers(context),
        body: JSON.stringify({ reactionStatus: 'ALL' }),
      },
      { provider: 'yandex-market' },
    );
    assertOk(payload);
    const reviews = (payload.result?.feedbacks ?? [])
      .map(mapFeedback)
      .filter((item): item is ProviderReviewRecord => Boolean(item));
    const nextCursor = String(payload.result?.paging?.nextPageToken || '').trim();
    return {
      reviews,
      hasMore: Boolean(nextCursor && nextCursor !== cursor),
      ...(nextCursor && nextCursor !== cursor ? { nextCursor } : {}),
    };
  }

  async publishReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyResult> {
    const text = input.text.trim();
    if (!/^\d+$/.test(input.reviewReference)) {
      throw new ProviderAdapterError({
        code: 'YANDEX_MARKET_FEEDBACK_ID_INVALID',
        message: 'Яндекс Маркет: некорректный feedbackId',
        statusCode: 422,
        retryable: false,
      });
    }
    if (text.length < 1 || text.length > 4096) {
      throw new ProviderAdapterError({
        code: 'YANDEX_MARKET_REPLY_INVALID',
        message: 'Яндекс Маркет принимает ответ длиной от 1 до 4096 символов',
        statusCode: 422,
        retryable: false,
      });
    }

    const payload = await providerFetchJson<MarketCommentResponse>(
      feedbackUrl(context, '/comments/update'),
      {
        method: 'POST',
        headers: headers(context),
        body: JSON.stringify({
          feedbackId: Number(input.reviewReference),
          comment: { text },
        }),
      },
      { provider: 'yandex-market' },
    );
    assertOk(payload);
    const result = payload.result && !('comments' in payload.result) ? payload.result : null;
    const status = String(result?.status || '').toUpperCase();
    return {
      status: status === 'PUBLISHED' ? 'CONFIRMED' : 'UNKNOWN',
      ...(Number.isInteger(result?.id) ? { externalReplyId: String(result?.id) } : {}),
      providerState: status || 'COMMENT_ACCEPTED',
    };
  }

  async reconcileReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyReconciliationResult> {
    if (!/^\d+$/.test(input.reviewReference)) {
      return { status: 'UNKNOWN', providerState: 'INVALID_FEEDBACK_ID' };
    }
    const payload = await providerFetchJson<MarketCommentResponse>(
      `${feedbackUrl(context, '/comments')}?limit=50`,
      {
        method: 'POST',
        headers: headers(context),
        body: JSON.stringify({ feedbackId: Number(input.reviewReference) }),
      },
      { provider: 'yandex-market' },
    );
    assertOk(payload);
    const result = payload.result && 'comments' in payload.result ? payload.result : null;
    const expected = input.text.trim();
    const match = (result?.comments ?? []).find((comment) => (
      comment.author?.type === 'BUSINESS'
      && String(comment.text || '').trim() === expected
      && comment.status !== 'DELETED'
    ));
    if (!match) {
      return { status: 'ABSENT', providerState: 'BUSINESS_COMMENT_NOT_FOUND' };
    }
    return {
      status: match.status === 'PUBLISHED' ? 'CONFIRMED' : 'UNKNOWN',
      ...(Number.isInteger(match.id) ? { externalReplyId: String(match.id) } : {}),
      providerState: match.status || 'COMMENT_PRESENT',
    };
  }
}
