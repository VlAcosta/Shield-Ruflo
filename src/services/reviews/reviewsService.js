import { getRuntimeEnv } from '../core/runtimeEnv';
import { REVIEW_STATUS, REVIEW_WORKFLOW } from '../../features/reviews/model/reviewData';
import { apiRequest, joinEndpoint } from '../core/apiClient';

const API_ENDPOINT = String(getRuntimeEnv('REVIEWS_ENDPOINT') || joinEndpoint(getRuntimeEnv('API_BASE', '/api/v1'), '/reviews')).replace(/\/$/, '');
export const REVIEWS_CHANGED_EVENT = 'business-shield:reviews-changed';

function normalizeReview(item = {}, index = 0) {
  const status = item.status || REVIEW_STATUS.NEW;
  const workflowStatus = item.workflowStatus || (
    status === REVIEW_STATUS.DONE ? REVIEW_WORKFLOW.PUBLISHED
      : status === REVIEW_STATUS.DEFERRED ? REVIEW_WORKFLOW.DRAFT
        : REVIEW_WORKFLOW.INBOX
  );
  const normalizedWorkflowStatus = workflowStatus === 'awaiting_approval' ? REVIEW_WORKFLOW.APPROVAL : workflowStatus;
  const fallbackDate = new Date(Date.now() - (index + 1) * 75 * 60 * 1000);
  const fallbackCreatedAt = fallbackDate.toISOString();
  const hasCreatedAt = Boolean(item.createdAt);
  const createdAt = item.createdAt || fallbackCreatedAt;
  const createdDate = new Date(createdAt);
  const author = item.author || 'Гость';
  return {
    ...item,
    author,
    initials: item.initials || author.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'Г',
    source: item.source || item.location?.name || item.business?.name || item.provider || 'Источник',
    status,
    workflowStatus: normalizedWorkflowStatus,
    createdAt,
    date: item.date || (hasCreatedAt ? createdDate.toLocaleDateString('ru-RU') : 'сегодня'),
    time: item.time || createdDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    tags: Array.isArray(item.tags) ? item.tags : [],
    aiReasons: Array.isArray(item.aiReasons) ? item.aiReasons : (Array.isArray(item.tags) ? item.tags : []),
    reply: item.reply || '',
    approval: item.approval || null,
    legalCase: item.legalCase || null,
    taskId: item.taskId || '',
  };
}

function normalizeReviews(items = []) {
  return (Array.isArray(items) ? items : []).map(normalizeReview);
}

function emitReviewsChanged(reviews) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REVIEWS_CHANGED_EVENT, {
    detail: { pending: reviews.filter((item) => item.status === REVIEW_STATUS.NEW).length, reviews },
  }));
}

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(API_ENDPOINT, path), { ...options, timeout: 8000 });
}

export function getCachedReviews() {
  return [];
}

export async function getReviews({ signal, page = 1, pageSize = 30, ...filters } = {}) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const payload = await request(`?${query.toString()}`, { signal });
  const reviews = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(reviews)) throw new Error('Сервер вернул некорректный список отзывов');
  return { items: normalizeReviews(reviews), pagination: payload?.pagination || { page, pageSize, total: reviews.length, pages: 1 } };
}

export async function updateReview(reviewId, patch) {
  const allowed = ['status', 'workflowStatus', 'tags'].reduce((result, key) => (
    patch[key] === undefined ? result : { ...result, [key]: patch[key] }
  ), {});
  const payload = await request(`/${reviewId}`, { method: 'PATCH', body: allowed });
  if (!payload?.review) throw new Error('Сервер не подтвердил изменение отзыва');
  emitReviewsChanged([normalizeReview(payload.review)]);
  return normalizeReview(payload.review);
}

export async function submitReviewReply(reviewId, reply, { publish = false } = {}) {
  const text = String(reply || '').trim();
  if (!text) throw new Error('Ответ пуст');
  const payload = await request(`/${reviewId}/reply`, { method: 'POST', body: { text, publish } });
  if (!payload?.review) throw new Error('Сервер не подтвердил сохранение ответа');
  return { review: normalizeReview(payload.review), reply: payload.reply || null };
}

export async function getReviewReplyHistory(reviewId, { signal } = {}) {
  const payload = await request(`/${reviewId}/replies`, { signal });
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function submitReplyForApproval(reviewId, replyId) {
  const payload = await request(`/${reviewId}/replies/${replyId}/submit`, { method: 'POST' });
  if (!payload?.review || !payload?.reply) throw new Error('Сервер не подтвердил отправку ответа на согласование');
  return { review: normalizeReview(payload.review), reply: payload.reply };
}

export async function approveReviewReply(reviewId, replyId) {
  const payload = await request(`/${reviewId}/replies/${replyId}/approve`, { method: 'POST' });
  if (!payload?.review || !payload?.reply) throw new Error('Сервер не подтвердил согласование ответа');
  return { review: normalizeReview(payload.review), reply: payload.reply };
}

export async function rejectReviewReply(reviewId, replyId, reason = '') {
  const payload = await request(`/${reviewId}/replies/${replyId}/reject`, {
    method: 'POST',
    body: { reason: String(reason || '').trim() || undefined },
  });
  if (!payload?.review || !payload?.reply) throw new Error('Сервер не подтвердил отклонение ответа');
  return { review: normalizeReview(payload.review), reply: payload.reply };
}

export async function publishReviewReply(reviewId, replyId) {
  return request(`/${reviewId}/replies/${replyId}/publish`, { method: 'POST' });
}

export async function getPendingReviewsCount({ signal } = {}) {
  const payload = await request('?status=new&page=1&pageSize=1', { signal });
  return Number(payload?.pagination?.total || 0);
}
