import type {
  ProviderAdapter,
  ProviderConnectionContext,
  ProviderReplyInput,
  ProviderReplyReconciliationResult,
  ProviderReplyResult,
  ProviderReviewRecord,
  ProviderReviewSyncResult,
} from '../provider.types.js';
import { configString, providerFetch, providerFetchJson, requireCredential } from '../provider-http.js';
import { ProviderAdapterError } from '../provider.errors.js';

const DEFAULT_BASE_URL = 'https://feedbacks-api.wildberries.ru';
const PAGE_SIZE = 1000;

type WbFeedback = {
  id?: string;
  text?: string;
  productValuation?: number;
  userName?: string;
  createdDate?: string;
  updatedDate?: string;
  answer?: { text?: string; state?: string } | null;
  productDetails?: { nmId?: number; productName?: string; imtId?: number };
  photoLinks?: Array<{ fullSize?: string; miniSize?: string }>;
};

type WbListResponse = {
  data?: { feedbacks?: WbFeedback[] };
  error?: boolean;
  errorText?: string;
};

type WbSingleResponse = { data?: WbFeedback; error?: boolean; errorText?: string };

type CursorState = { answered: boolean; skip: number };

function baseUrl(context: ProviderConnectionContext): string {
  return (configString(context.configuration, 'apiBaseUrl') || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function headers(context: ProviderConnectionContext): HeadersInit {
  return {
    Authorization: requireCredential(context.credentials, 'apiToken', 'wildberries'),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function decodeCursor(cursor?: string): CursorState {
  if (!cursor) return { answered: false, skip: 0 };
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorState;
    if (typeof value.answered !== 'boolean' || !Number.isInteger(value.skip) || value.skip < 0) throw new Error('invalid');
    return value;
  } catch {
    throw new ProviderAdapterError({
      code: 'WILDBERRIES_CURSOR_INVALID',
      message: 'Wildberries: некорректный cursor синхронизации',
      statusCode: 500,
      retryable: false,
    });
  }
}

function encodeCursor(value: CursorState): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function validDate(value?: string): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function mapFeedback(feedback: WbFeedback): ProviderReviewRecord | null {
  const id = String(feedback.id || '').trim();
  const rating = Number(feedback.productValuation);
  if (!id || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const nmId = feedback.productDetails?.nmId;
  const productName = String(feedback.productDetails?.productName || '').trim();
  const locationId = nmId ? String(nmId) : '';
  const locationName = productName || (locationId ? `WB ${locationId}` : '');
  return {
    externalId: id,
    rating,
    text: String(feedback.text || ''),
    authorName: String(feedback.userName || 'Покупатель Wildberries'),
    authorExternalId: `wb:${id}:author`,
    publishedAt: validDate(feedback.createdDate),
    ...(feedback.updatedDate ? { providerUpdatedAt: validDate(feedback.updatedDate) } : {}),
    ...(locationId ? { providerLocationId: locationId } : {}),
    ...(locationName ? { providerLocationName: locationName } : {}),
    ...(locationId ? { sourceUrl: `https://www.wildberries.ru/catalog/${locationId}/detail.aspx` } : {}),
    raw: {
      answerPresent: Boolean(feedback.answer?.text),
      answerState: feedback.answer?.state ?? null,
      imtId: feedback.productDetails?.imtId ?? null,
      photoCount: feedback.photoLinks?.length ?? 0,
    },
  };
}

function assertEnvelope(payload: WbListResponse | WbSingleResponse) {
  if (payload.error) {
    throw new ProviderAdapterError({
      code: 'WILDBERRIES_API_ERROR',
      message: String(payload.errorText || 'Wildberries API вернул ошибку'),
      statusCode: 502,
      retryable: true,
    });
  }
}

export class WildberriesProviderAdapter implements ProviderAdapter {
  readonly id = 'wb';
  readonly displayName = 'Wildberries';
  readonly capabilities = ['reviews.read', 'reviews.reply'] as const;

  availability() {
    return { configured: true, connectable: true };
  }

  async connect(context: ProviderConnectionContext) {
    const url = new URL('/api/v1/feedbacks/count-unanswered', baseUrl(context));
    const payload = await providerFetchJson<{ data?: number; error?: boolean; errorText?: string }>(url.toString(), {
      method: 'GET',
      headers: headers(context),
    }, { provider: 'wildberries' });
    assertEnvelope(payload);
    return {
      verified: true as const,
      health: 'CONNECTED' as const,
      externalAccountId: context.externalAccountId || 'wildberries-seller',
      configuration: { apiBaseUrl: baseUrl(context), syncEnabled: true },
      validatedAt: new Date(),
    };
  }

  async disconnect() {
    return { confirmed: true };
  }

  async syncReviews(context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult> {
    const state = decodeCursor(cursor);
    const query = new URLSearchParams({
      isAnswered: String(state.answered),
      take: String(PAGE_SIZE),
      skip: String(state.skip),
      order: 'dateDesc',
    });
    const nmId = configString(context.configuration, 'nmId');
    if (/^\d+$/.test(nmId)) query.set('nmId', nmId);
    const payload = await providerFetchJson<WbListResponse>(`${baseUrl(context)}/api/v1/feedbacks?${query}`, {
      method: 'GET',
      headers: headers(context),
    }, { provider: 'wildberries' });
    assertEnvelope(payload);
    const source = payload.data?.feedbacks ?? [];
    const reviews = source.map(mapFeedback).filter((item): item is ProviderReviewRecord => Boolean(item));
    const fullPage = source.length >= PAGE_SIZE;
    let next: CursorState | null = null;
    if (fullPage) next = { answered: state.answered, skip: state.skip + source.length };
    else if (!state.answered) next = { answered: true, skip: 0 };
    return {
      reviews,
      hasMore: Boolean(next),
      ...(next ? { nextCursor: encodeCursor(next) } : {}),
    };
  }

  async publishReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyResult> {
    const text = input.text.trim();
    if (text.length < 2 || text.length > 5000) {
      throw new ProviderAdapterError({
        code: 'WILDBERRIES_REPLY_INVALID',
        message: 'Wildberries принимает ответ длиной от 2 до 5000 символов',
        statusCode: 422,
        retryable: false,
      });
    }
    await providerFetch(`${baseUrl(context)}/api/v1/feedbacks/answer`, {
      method: 'POST',
      headers: headers(context),
      body: JSON.stringify({ id: input.reviewReference, text }),
    }, { provider: 'wildberries', successStatuses: [204] });
    // WB accepts the request before a durable answer can be proven. Reconcile
    // with GET /feedback before Business Shield marks the reply as published.
    return { status: 'UNKNOWN', providerState: 'ANSWER_ACCEPTED_FOR_RECONCILIATION' };
  }

  async reconcileReply(context: ProviderConnectionContext, input: ProviderReplyInput): Promise<ProviderReplyReconciliationResult> {
    const query = new URLSearchParams({ id: input.reviewReference });
    const payload = await providerFetchJson<WbSingleResponse>(`${baseUrl(context)}/api/v1/feedback?${query}`, {
      method: 'GET',
      headers: headers(context),
    }, { provider: 'wildberries' });
    assertEnvelope(payload);
    const answer = String(payload.data?.answer?.text || '').trim();
    if (!answer) return { status: 'ABSENT', providerState: payload.data?.answer?.state || 'NO_ANSWER' };
    return {
      status: answer === input.text.trim() ? 'CONFIRMED' : 'UNKNOWN',
      externalReplyId: `wb-answer:${input.reviewReference}`,
      providerState: payload.data?.answer?.state || 'ANSWER_PRESENT',
    };
  }
}
