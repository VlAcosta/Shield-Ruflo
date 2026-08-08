import { getRuntimeEnv } from '../core/runtimeEnv';
import {
  DEFAULT_REVIEW_SETTINGS,
  REVIEW_RESPONSE_MODES,
  REVIEW_SENTIMENT,
  REVIEW_WORKFLOW,
  sentimentByRating,
  slaHoursByRating,
} from '../../features/reviews/model/reviewData';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { createTask, getTasksSnapshot } from '../tasks/taskService';
import { recordCompanyActivity } from '../activity/companyActivityService';
import { getCachedReviews, updateReview } from './reviewsService';

const SETTINGS_KEY = 'business-shield:reviews:intelligence-settings:v1';
const INTELLIGENCE_ENDPOINT = String(getRuntimeEnv('REVIEWS_INTELLIGENCE_ENDPOINT')).replace(/\/$/, '');
const PROVIDER_ENDPOINT = String(getRuntimeEnv('REVIEW_PROVIDERS_ENDPOINT')).replace(/\/$/, '');
const AI_ENDPOINT = String(getRuntimeEnv('REVIEWS_AI_ENDPOINT')).replace(/\/$/, '');
export const REVIEW_SETTINGS_CHANGED_EVENT = 'business-shield:review-settings-changed';

const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizeSettings(settings = {}) {
  const responseMode = REVIEW_RESPONSE_MODES.some((item) => item.id === settings.responseMode)
    ? settings.responseMode
    : DEFAULT_REVIEW_SETTINGS.responseMode;

  return {
    ...clone(DEFAULT_REVIEW_SETTINGS),
    ...settings,
    responseMode,
    slaHours: {
      ...DEFAULT_REVIEW_SETTINGS.slaHours,
      ...(settings.slaHours || {}),
    },
  };
}

export function readReviewSettings() {
  const cached = readScopedJson(SETTINGS_KEY, {
    scope: getCompanyScope(),
    legacy: true,
    fallback: null,
  });
  return normalizeSettings(cached || {});
}

export async function getReviewSettings({ signal } = {}) {
  if (!INTELLIGENCE_ENDPOINT) return readReviewSettings();
  try {
    const payload = await apiRequest(joinEndpoint(INTELLIGENCE_ENDPOINT, '/settings'), {
      signal,
      timeout: 8000,
    });
    const next = normalizeSettings(payload?.settings || payload || {});
    writeScopedJson(SETTINGS_KEY, next, { scope: getCompanyScope() });
    return next;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return readReviewSettings();
  }
}

export async function saveReviewSettings(patch = {}) {
  let next = normalizeSettings({ ...readReviewSettings(), ...patch });

  if (INTELLIGENCE_ENDPOINT) {
    const remote = await apiRequest(joinEndpoint(INTELLIGENCE_ENDPOINT, '/settings'), {
      method: 'PATCH',
      body: next,
      timeout: 8000,
    });
    next = normalizeSettings(remote?.settings || remote || next);
  }

  writeScopedJson(SETTINGS_KEY, next, { scope: getCompanyScope() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REVIEW_SETTINGS_CHANGED_EVENT, { detail: clone(next) }));
  }

  recordCompanyActivity({
    type: 'reviews.settings',
    title: 'Изменены настройки работы с отзывами',
    detail: REVIEW_RESPONSE_MODES.find((item) => item.id === next.responseMode)?.label || next.responseMode,
    route: '/reviews',
    tone: 'violet',
  });

  return next;
}

export function getReviewSentiment(review) {
  return sentimentByRating(review?.rating);
}

export function getReviewSla(review, settings = readReviewSettings()) {
  const hours = slaHoursByRating(review?.rating, settings);
  const startedAt = new Date(review?.createdAt || Date.now()).getTime();
  const deadlineAt = startedAt + hours * 60 * 60 * 1000;
  const remainingMs = deadlineAt - Date.now();
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const progress = Math.min(100, Math.max(0, Math.round((elapsedMs / (hours * 60 * 60 * 1000)) * 100)));
  const overdue = remainingMs <= 0 && review?.workflowStatus !== REVIEW_WORKFLOW.PUBLISHED;

  return {
    hours,
    deadlineAt: new Date(deadlineAt).toISOString(),
    remainingMs,
    progress,
    overdue,
    remainingHours: Math.max(0, Math.floor(remainingMs / 3600000)),
    remainingMinutes: Math.max(0, Math.floor((remainingMs % 3600000) / 60000)),
  };
}

function reasonFromText(text = '') {
  const value = String(text).toLowerCase();
  const checks = [
    ['качество', ['качест', 'слом', 'брак', 'плохой товар']],
    ['персонал', ['персонал', 'сотрудник', 'груб', 'хам']],
    ['цена', ['цена', 'дорог', 'стоимость']],
    ['доставка', ['достав', 'курьер', 'приехал позже', 'задерж']],
    ['сервис', ['поддержк', 'сервис', 'ответил', 'обслуж']],
    ['ожидание', ['ждали', 'ожидан', 'очеред', 'долго']],
    ['чистота', ['гряз', 'чистот']],
    ['товар', ['товар', 'цвет', 'размер', 'комплект']],
    ['описание', ['описан', 'не соответствует']],
    ['возврат', ['возврат', 'деньги', 'вернуть']],
  ];
  return checks.filter(([, keywords]) => keywords.some((word) => value.includes(word))).map(([reason]) => reason);
}

function localDraft(review, settings) {
  const reasons = review.aiReasons?.length ? review.aiReasons : reasonFromText(review.text);
  const author = String(review.author || '').split(' ')[0] || 'Здравствуйте';
  const tone = settings.tonePreset;
  const negative = getReviewSentiment(review) === REVIEW_SENTIMENT.NEGATIVE;
  const reasonText = reasons.length ? ` по поводу ${reasons.slice(0, 2).join(' и ')}` : '';

  if (Number(review.rating) === 5) {
    return `${author}, спасибо за высокую оценку! Нам очень приятно, что вы остались довольны. Будем рады видеть вас снова.`;
  }
  if (Number(review.rating) === 4) {
    return `${author}, спасибо за обратную связь и хорошую оценку. Замечание${reasonText} приняли в работу — постараемся сделать следующий опыт ещё лучше.`;
  }
  if (negative) {
    if (tone === 'concise') return `${author}, спасибо за обратную связь. Приносим извинения за ситуацию${reasonText}. Хотим разобраться — пожалуйста, уточните номер заказа или дату визита.`;
    if (tone === 'official') return `${author}, благодарим за обратную связь. Приносим извинения за возникшую ситуацию${reasonText}. Просим сообщить номер заказа или дату визита, чтобы мы могли провести проверку и предложить решение.`;
    if (tone === 'expert') return `${author}, спасибо, что подробно описали ситуацию${reasonText}. Мы уже фиксируем обращение и проверим процесс по вашему случаю. Для точной проверки пришлите, пожалуйста, номер заказа или дату визита — после этого вернёмся с конкретным решением.`;
    return `${author}, спасибо, что написали. Нам жаль, что возникла такая ситуация${reasonText}. Хотим разобраться и помочь: пришлите, пожалуйста, номер заказа или дату визита — проверим детали и вернёмся с решением.`;
  }
  return `${author}, спасибо за отзыв. Мы увидели ваше замечание${reasonText} и передадим его команде. Если сможете уточнить детали, это поможет нам быстрее улучшить процесс.`;
}

export async function generateAiDraft(review, settings = readReviewSettings()) {
  if (AI_ENDPOINT) {
    try {
      const payload = await apiRequest(joinEndpoint(AI_ENDPOINT, '/draft'), {
        method: 'POST',
        body: {
          reviewId: review.id,
          rating: review.rating,
          text: review.text,
          platform: review.platform,
          tone: settings.tonePreset,
          instruction: settings.toneInstruction,
        },
        timeout: 12000,
      });
      if (payload?.text) return {
        text: payload.text,
        reasons: settings.aiReasonsEnabled ? (payload.reasons || reasonFromText(review.text)) : (review.aiReasons || []),
        source: 'ai',
      };
    } catch {
      // Local copilot remains available when the AI endpoint is unavailable.
    }
  }

  return {
    text: localDraft(review, settings),
    reasons: settings.aiReasonsEnabled
      ? (review.aiReasons?.length ? review.aiReasons : reasonFromText(review.text))
      : (review.aiReasons || []),
    source: 'local',
  };
}

export async function ensureNegativeReviewTask(review) {
  if (!review || Number(review.rating) > 3 || review.taskId || review.status === 'done') return review?.taskId || '';
  const settings = readReviewSettings();

  const snapshot = await getTasksSnapshot();
  const existing = (snapshot.tasks || []).find((task) => task.sourceReviewId === review.id);
  if (existing) return existing.id;

  const priority = Number(review.rating) <= 2 ? 'critical' : 'high';
  const due = new Date(Date.now() + slaHoursByRating(review.rating, settings) * 60 * 60 * 1000);
  const dueDate = due.toLocaleDateString('ru-RU');
  const result = await createTask({
    title: `Обработать отзыв ${review.rating}★ · ${review.platform}`,
    type: 'Отзывы',
    priority,
    status: 'new',
    dueDate,
    description: `${review.author}: ${review.text}`,
    sourceReviewId: review.id,
    sourceReviewPlatform: review.platform,
    comments: [],
    checklist: [
      { id: `check-${review.id}-1`, text: 'Проверить контекст отзыва', done: false },
      { id: `check-${review.id}-2`, text: 'Подготовить ответ', done: false },
      { id: `check-${review.id}-3`, text: settings.responseMode === 'approval' ? 'Получить согласование' : settings.responseMode === 'shield' ? 'Передать Бизнес Щит' : 'Опубликовать ответ', done: false },
    ],
    attachments: [],
  }, snapshot);

  const taskId = result?.task?.id || '';
  if (taskId) {
    await updateReview(review.id, { taskId });
    recordCompanyActivity({
      type: 'reviews.automation.task',
      title: 'Создана задача из негативного отзыва',
      detail: `${review.platform} · ${review.rating}★`,
      route: `/reviews?review=${encodeURIComponent(review.id)}`,
      targetId: review.id,
      tone: 'orange',
    });
  }
  return taskId;
}

export async function submitDraftForApproval(reviewId, reply) {
  const patch = {
    reply: String(reply || '').trim(),
    workflowStatus: REVIEW_WORKFLOW.APPROVAL,
    approval: {
      status: 'pending',
      requestedAt: new Date().toISOString(),
      requestedBy: 'Исполнитель',
    },
  };
  await updateReview(reviewId, patch);
  recordCompanyActivity({
    type: 'reviews.approval.requested',
    title: 'Ответ отправлен на согласование',
    route: `/reviews?review=${encodeURIComponent(reviewId)}`,
    targetId: reviewId,
    tone: 'violet',
  });
  return patch;
}

export async function approveReviewDraft(reviewId) {
  const current = getCachedReviews().find((item) => item.id === reviewId);
  const patch = {
    workflowStatus: REVIEW_WORKFLOW.APPROVED,
    approval: {
      ...(current?.approval || {}),
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: 'Руководитель',
    },
  };
  await updateReview(reviewId, patch);
  recordCompanyActivity({
    type: 'reviews.approval.approved',
    title: 'Ответ на отзыв согласован',
    route: `/reviews?review=${encodeURIComponent(reviewId)}`,
    targetId: reviewId,
    tone: 'success',
  });
  return patch;
}

export async function requestReviewDraftChanges(reviewId, note = '') {
  const current = getCachedReviews().find((item) => item.id === reviewId);
  const patch = {
    workflowStatus: REVIEW_WORKFLOW.DRAFT,
    approval: {
      ...(current?.approval || {}),
      status: 'changes',
      note: String(note || '').trim(),
      changedAt: new Date().toISOString(),
      changedBy: 'Руководитель',
    },
  };
  await updateReview(reviewId, patch);
  recordCompanyActivity({
    type: 'reviews.approval.changes',
    title: 'Ответ возвращён на доработку',
    detail: patch.approval.note,
    route: `/reviews?review=${encodeURIComponent(reviewId)}`,
    targetId: reviewId,
    tone: 'orange',
  });
  return patch;
}

export async function openLegalReviewCase(reviewId, payload = {}) {
  const patch = {
    status: 'deferred',
    workflowStatus: REVIEW_WORKFLOW.LEGAL,
    legalCase: {
      status: 'precheck',
      reason: String(payload.reason || 'Спорный отзыв — требуется проверка').trim(),
      evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
      openedAt: new Date().toISOString(),
    },
  };
  await updateReview(reviewId, patch);
  recordCompanyActivity({
    type: 'reviews.legal.opened',
    title: 'Отзыв передан на юридическую проверку',
    detail: patch.legalCase.reason,
    route: `/reviews?review=${encodeURIComponent(reviewId)}`,
    targetId: reviewId,
    tone: 'red',
  });
  return patch;
}

export async function publishThroughProvider(review, reply) {
  const text = String(reply || '').trim();
  if (!text) throw new Error('Ответ пуст');

  if (PROVIDER_ENDPOINT) {
    await apiRequest(joinEndpoint(PROVIDER_ENDPOINT, '/reply'), {
      method: 'POST',
      body: { reviewId: review.id, externalId: review.externalId || review.id, platform: review.platform, text },
      idempotencyKey: createIdempotencyKey('review-reply'),
      timeout: 12000,
    });
  }

  const patch = {
    reply: text,
    status: 'done',
    workflowStatus: REVIEW_WORKFLOW.PUBLISHED,
    repliedAt: new Date().toISOString(),
    approval: review.approval?.status === 'approved' ? review.approval : null,
    publishTransport: PROVIDER_ENDPOINT ? 'provider' : 'local-demo',
  };
  await updateReview(review.id, patch);
  recordCompanyActivity({
    type: 'reviews.reply.published',
    title: 'Опубликован ответ на отзыв',
    detail: `${review.platform} · ${review.rating}★`,
    route: `/reviews?review=${encodeURIComponent(review.id)}`,
    targetId: review.id,
    tone: 'success',
  });
  return patch;
}

export async function delegateReviewToShield(reviewId, note = '') {
  const patch = {
    status: 'deferred',
    workflowStatus: REVIEW_WORKFLOW.SHIELD,
    assignee: 'Бизнес Щит',
    shieldQueue: {
      status: 'assigned',
      note: String(note || '').trim(),
      assignedAt: new Date().toISOString(),
    },
  };
  await updateReview(reviewId, patch);
  recordCompanyActivity({
    type: 'reviews.shield.assigned',
    title: 'Отзыв передан команде Бизнес Щит',
    detail: patch.shieldQueue.note,
    route: `/reviews?review=${encodeURIComponent(reviewId)}`,
    targetId: reviewId,
    tone: 'violet',
  });
  return patch;
}
