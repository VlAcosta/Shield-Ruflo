import { getRuntimeEnv } from '../core/runtimeEnv';
import { DEFAULT_REVIEWS, REVIEW_STATUS, REVIEW_WORKFLOW } from '../../features/reviews/model/reviewData';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const STORAGE_KEY = 'business-shield:reviews';
const API_ENDPOINT = String(getRuntimeEnv('REVIEWS_ENDPOINT')).replace(/\/$/, '');
export const REVIEWS_CHANGED_EVENT = 'business-shield:reviews-changed';


function normalizeReview(item = {}, index = 0) {
  const status = item.status || REVIEW_STATUS.NEW;
  const workflowStatus = item.workflowStatus || (
    status === REVIEW_STATUS.DONE ? REVIEW_WORKFLOW.PUBLISHED
      : status === REVIEW_STATUS.DEFERRED ? REVIEW_WORKFLOW.DRAFT
        : REVIEW_WORKFLOW.INBOX
  );
  const fallbackDate = new Date(Date.now() - (index + 1) * 75 * 60 * 1000);
  const fallbackCreatedAt = fallbackDate.toISOString();
  const hasCreatedAt = Boolean(item.createdAt);
  return {
    ...item,
    status,
    workflowStatus,
    createdAt: item.createdAt || fallbackCreatedAt,
    date: hasCreatedAt ? item.date : 'сегодня',
    time: hasCreatedAt ? item.time : fallbackDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    tags: Array.isArray(item.tags) ? item.tags : [],
    aiReasons: Array.isArray(item.aiReasons) ? item.aiReasons : (Array.isArray(item.tags) ? item.tags : []),
    reply: item.reply || '',
    approval: item.approval || null,
    legalCase: item.legalCase || null,
    taskId: item.taskId || '',
  };
}

function normalizeReviews(items = []) {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeReview);
  if (!isDemoDataEnabled()) return normalized;
  const ids = new Set(normalized.map((item) => item.id));
  const platforms = new Set(normalized.map((item) => item.platform));
  const missingPrimaryDemo = DEFAULT_REVIEWS.filter((item) => !ids.has(item.id) && ['Ozon', 'WB'].includes(item.platform) && !platforms.has(item.platform));
  return [...normalized, ...missingPrimaryDemo.map((item, index) => normalizeReview(item, normalized.length + index))];
}

function cloneDefaultReviews() {
  if (!isDemoDataEnabled()) return [];
  return DEFAULT_REVIEWS.map((item, index) => normalizeReview({ ...item, tags: [...(item.tags || [])], aiReasons: [...(item.aiReasons || [])] }, index));
}

function emitReviewsChanged(reviews) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REVIEWS_CHANGED_EVENT, {
    detail: { pending: reviews.filter((item) => item.status === REVIEW_STATUS.NEW).length, reviews },
  }));
}

function readLocalReviews() {
  const parsed = readScopedJson(STORAGE_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
  if (Array.isArray(parsed)) return normalizeReviews(parsed);
  const seeded = cloneDefaultReviews();
  writeScopedJson(STORAGE_KEY, seeded, { scope: getCompanyScope() });
  return seeded;
}

function writeLocalReviews(reviews, { emit = true } = {}) {
  writeScopedJson(STORAGE_KEY, reviews, { scope: getCompanyScope() });
  if (emit && typeof window !== 'undefined') emitReviewsChanged(reviews);
  return reviews;
}

async function request(path = '', options = {}) {
  if (!API_ENDPOINT) return null;
  return apiRequest(joinEndpoint(API_ENDPOINT, path), { ...options, timeout: 8000 });
}

export function getCachedReviews() {
  return readLocalReviews();
}

export async function getReviews({ signal } = {}) {
  if (!API_ENDPOINT) return readLocalReviews();

  try {
    const payload = await request('', { signal });
    const reviews = Array.isArray(payload) ? payload : payload?.items;
    if (Array.isArray(reviews)) writeLocalReviews(normalizeReviews(reviews), { emit: false });
    return Array.isArray(reviews) ? normalizeReviews(reviews) : readLocalReviews();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return readLocalReviews();
  }
}

export async function updateReview(reviewId, patch) {
  const local = readLocalReviews().map((item) => (
    item.id === reviewId ? { ...item, ...patch } : item
  ));
  writeLocalReviews(local);

  if (API_ENDPOINT) {
    request(`/${reviewId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  return local;
}

export async function submitReviewReply(reviewId, reply) {
  const patch = {
    reply: String(reply || '').trim(),
    status: REVIEW_STATUS.DONE,
    workflowStatus: REVIEW_WORKFLOW.PUBLISHED,
    repliedAt: new Date().toISOString(),
  };

  const local = await updateReview(reviewId, patch);

  if (API_ENDPOINT) {
    request(`/${reviewId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ text: patch.reply }),
    }).catch(() => {});
  }

  return local;
}

export function getPendingReviewsCount() {
  return readLocalReviews().filter((item) => item.status === REVIEW_STATUS.NEW).length;
}
