import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest } from '../core/apiClient';
import { isDemoDataEnabled } from '../core/runtimeConfig';
import { getReviews } from '../reviews/reviewsService';
import { getReviewSettings, getReviewSentiment, getReviewSla } from '../reviews/reviewIntelligenceService';

const ENDPOINT = String(getRuntimeEnv('REPUTATION_ANALYTICS_ENDPOINT')).replace(/\/$/, '');
const DAY = 24 * 60 * 60 * 1000;

const demoAt = (daysAgo, rating, platform, reasons, responseHours = 5) => ({
  id: `history-${daysAgo}-${platform}-${rating}-${reasons.join('-')}`,
  createdAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
  repliedAt: new Date(Date.now() - daysAgo * DAY + responseHours * 60 * 60 * 1000).toISOString(),
  rating,
  platform,
  aiReasons: reasons,
  tags: reasons,
  workflowStatus: 'published',
  status: 'done',
});

const DEMO_HISTORY = [
  demoAt(4, 2, 'Ozon', ['доставка', 'качество'], 5.8),
  demoAt(5, 5, 'Яндекс', ['сервис'], 8),
  demoAt(6, 3, 'WB', ['качество'], 13),
  demoAt(8, 4, '2GIS', ['ожидание'], 9),
  demoAt(10, 5, 'Яндекс', ['персонал'], 5),
  demoAt(12, 2, 'Ozon', ['доставка'], 7),
  demoAt(14, 4, 'Отзовик', ['сервис'], 18),
  demoAt(16, 5, '2GIS', ['качество'], 10),
  demoAt(18, 3, 'WB', ['цена', 'качество'], 15),
  demoAt(20, 5, 'Яндекс', ['персонал'], 7),
  demoAt(23, 4, 'Ozon', ['доставка'], 19),
  demoAt(27, 5, '2GIS', ['сервис'], 8),
  demoAt(32, 4, 'Отзовик', ['описание'], 21),
  demoAt(36, 5, 'Яндекс', ['сервис'], 9),
  demoAt(41, 3, 'Ozon', ['доставка', 'качество'], 14),
  demoAt(47, 5, 'WB', ['товар'], 11),
  demoAt(55, 4, '2GIS', ['персонал'], 18),
  demoAt(68, 5, 'Яндекс', ['сервис'], 8),
];

function number(value, digits = 1) {
  return Number(Number(value || 0).toFixed(digits));
}

function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function delta(current, previous, digits = 1) {
  if (!previous) return current ? 100 : 0;
  return number(((current - previous) / Math.abs(previous)) * 100, digits);
}

function responseHours(review) {
  if (!review.repliedAt || !review.createdAt) return null;
  return Math.max(0, (new Date(review.repliedAt).getTime() - new Date(review.createdAt).getTime()) / 3600000);
}

function average(items, selector) {
  const values = items.map(selector).filter((value) => Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function makeBuckets(items, days) {
  const now = new Date();
  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() - (days - index - 1) * DAY);
    return { key: dateKey(date), label: date.toLocaleDateString('ru-RU', { day: '2-digit', month: days > 14 ? '2-digit' : undefined }), reviews: [] };
  });
  const map = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  items.forEach((review) => {
    const bucket = map.get(dateKey(new Date(review.createdAt)));
    if (bucket) bucket.reviews.push(review);
  });
  return buckets.map((bucket) => ({
    date: bucket.key,
    label: bucket.label,
    count: bucket.reviews.length,
    rating: number(average(bucket.reviews, (item) => Number(item.rating)), 2),
    negative: bucket.reviews.filter((item) => Number(item.rating) <= 3).length,
    responseCoverage: pct(bucket.reviews.filter((item) => item.repliedAt || item.workflowStatus === 'published').length, bucket.reviews.length),
  }));
}

function summarize(items, settings) {
  const negative = items.filter((review) => getReviewSentiment(review) === 'negative');
  const replied = items.filter((review) => review.repliedAt || review.workflowStatus === 'published');
  const responseValues = items.map(responseHours).filter((value) => value !== null);
  const slaBreaches = items.filter((review) => getReviewSla(review, settings).overdue).length;
  return {
    count: items.length,
    rating: number(average(items, (review) => Number(review.rating)), 2),
    negativeShare: pct(negative.length, items.length),
    responseCoverage: pct(replied.length, items.length),
    avgResponseHours: number(average(responseValues, (value) => value), 1),
    slaBreaches,
  };
}

function groupReasons(items) {
  const map = new Map();
  items.forEach((review) => {
    if (Number(review.rating) > 3) return;
    (review.aiReasons || review.tags || []).forEach((reason) => map.set(reason, (map.get(reason) || 0) + 1));
  });
  return map;
}

function platformRows(current, previous, settings) {
  return ['Яндекс', '2GIS', 'Ozon', 'Отзовик', 'WB'].map((platform) => {
    const currentItems = current.filter((item) => item.platform === platform);
    const previousItems = previous.filter((item) => item.platform === platform);
    const summary = summarize(currentItems, settings);
    const previousSummary = summarize(previousItems, settings);
    return {
      platform,
      ...summary,
      ratingDelta: number(summary.rating - previousSummary.rating, 2),
      negativeDelta: summary.negativeShare - previousSummary.negativeShare,
      responseDelta: number(summary.avgResponseHours - previousSummary.avgResponseHours, 1),
    };
  });
}

function reasonRows(current, previous) {
  const currentMap = groupReasons(current);
  const previousMap = groupReasons(previous);
  return Array.from(new Set([...currentMap.keys(), ...previousMap.keys()]))
    .map((reason) => ({
      reason,
      count: currentMap.get(reason) || 0,
      previous: previousMap.get(reason) || 0,
      delta: delta(currentMap.get(reason) || 0, previousMap.get(reason) || 0, 0),
    }))
    .sort((a, b) => b.count - a.count || b.delta - a.delta)
    .slice(0, 8);
}

function buildInsights({ currentSummary, previousSummary, platforms, reasons }) {
  const insights = [];
  const topReason = reasons.find((item) => item.count > 0 && item.delta > 0) || reasons[0];
  if (topReason?.count) insights.push({
    id: 'reason-growth', tone: topReason.delta >= 50 ? 'danger' : 'amber',
    title: `${topReason.reason}: ${topReason.delta > 0 ? `+${topReason.delta}%` : 'главная причина'} негатива`,
    text: `За текущий период причина «${topReason.reason}» встретилась ${topReason.count} раз.`,
    action: 'Разобрать причину', automationTemplate: 'reason-spike',
  });
  const problemPlatform = [...platforms].filter((item) => item.count).sort((a, b) => b.negativeShare - a.negativeShare)[0];
  if (problemPlatform) insights.push({
    id: 'platform-risk', tone: problemPlatform.negativeShare >= 50 ? 'danger' : 'violet',
    title: `${problemPlatform.platform} создаёт ${problemPlatform.negativeShare}% негатива`,
    text: `${problemPlatform.count} отзывов за период · рейтинг ${problemPlatform.rating || '—'}.`,
    action: 'Открыть отзывы', route: `/reviews?platform=${encodeURIComponent(problemPlatform.platform)}`,
  });
  if (currentSummary.avgResponseHours > previousSummary.avgResponseHours && currentSummary.avgResponseHours) insights.push({
    id: 'response-slowdown', tone: 'amber',
    title: `Ответы стали медленнее на ${number(currentSummary.avgResponseHours - previousSummary.avgResponseHours, 1)} ч`,
    text: `Среднее время реакции сейчас ${currentSummary.avgResponseHours} ч.`,
    action: 'Защитить SLA', automationTemplate: 'sla-risk',
  });
  if (currentSummary.rating > previousSummary.rating && previousSummary.rating) insights.push({
    id: 'rating-growth', tone: 'green',
    title: `Рейтинг вырос на ${number(currentSummary.rating - previousSummary.rating, 2)}`,
    text: 'Позитивная динамика подтверждается текущим периодом.',
    action: 'Смотреть динамику',
  });
  if (currentSummary.slaBreaches) insights.push({
    id: 'sla-breach', tone: 'danger',
    title: `${currentSummary.slaBreaches} SLA уже просрочено`,
    text: 'Нужна реакция до того, как негатив останется без ответа дольше политики компании.',
    action: 'Настроить эскалацию', automationTemplate: 'sla-breach',
  });
  return insights.slice(0, 5);
}

function buildRecommendations({ currentSummary, reasons, platforms }) {
  const recommendations = [];
  const reason = reasons[0];
  if (reason?.count) recommendations.push({ id: 'reason', priority: 'P1', title: `Снизить жалобы: ${reason.reason}`, text: `Это наиболее частая причина негатива (${reason.count}). Создайте задачу на разбор первопричины.`, template: 'reason-spike' });
  const slow = [...platforms].filter((item) => item.avgResponseHours).sort((a, b) => b.avgResponseHours - a.avgResponseHours)[0];
  if (slow) recommendations.push({ id: 'response', priority: 'P1', title: `Ускорить реакцию на ${slow.platform}`, text: `Среднее время ответа ${slow.avgResponseHours} ч. Добавьте предупреждение до истечения SLA.`, template: 'sla-risk' });
  if (currentSummary.responseCoverage < 90) recommendations.push({ id: 'coverage', priority: 'P2', title: 'Довести охват ответами до 90%+', text: `Сейчас отвечено на ${currentSummary.responseCoverage}% отзывов.`, template: 'negative-review' });
  return recommendations.slice(0, 4);
}

export function buildReputationAnalytics(reviews, settings, days = 30) {
  const now = Date.now();
  const currentStart = now - days * DAY;
  const previousStart = now - days * 2 * DAY;
  let source = Array.isArray(reviews) ? reviews : [];
  const hasHistory = source.some((item) => new Date(item.createdAt).getTime() < currentStart);
  if (isDemoDataEnabled() && !hasHistory) source = [...source, ...DEMO_HISTORY];

  const current = source.filter((item) => {
    const time = new Date(item.createdAt).getTime();
    return time >= currentStart && time <= now;
  });
  const previous = source.filter((item) => {
    const time = new Date(item.createdAt).getTime();
    return time >= previousStart && time < currentStart;
  });
  const currentSummary = summarize(current, settings);
  const previousSummary = summarize(previous, settings);
  const platforms = platformRows(current, previous, settings);
  const reasons = reasonRows(current, previous);
  const health = Math.max(0, Math.min(100, Math.round(
    (currentSummary.rating / 5) * 42
    + currentSummary.responseCoverage * .28
    + (100 - currentSummary.negativeShare) * .2
    + Math.max(0, 10 - currentSummary.slaBreaches * 2)
  )));

  return {
    generatedAt: new Date().toISOString(),
    periodDays: days,
    health,
    current: currentSummary,
    previous: previousSummary,
    deltas: {
      rating: number(currentSummary.rating - previousSummary.rating, 2),
      negativeShare: currentSummary.negativeShare - previousSummary.negativeShare,
      responseCoverage: currentSummary.responseCoverage - previousSummary.responseCoverage,
      avgResponseHours: number(currentSummary.avgResponseHours - previousSummary.avgResponseHours, 1),
    },
    trend: makeBuckets(current, Math.min(days, 30)),
    platforms,
    reasons,
    insights: buildInsights({ currentSummary, previousSummary, platforms, reasons }),
    recommendations: buildRecommendations({ currentSummary, reasons, platforms }),
  };
}

export async function getReputationAnalytics({ days = 30, signal } = {}) {
  if (ENDPOINT) {
    try {
      return await apiRequest(`${ENDPOINT}?days=${days}`, { signal, timeout: 9000 });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }
  const [reviews, settings] = await Promise.all([getReviews({ signal }), getReviewSettings({ signal })]);
  return buildReputationAnalytics(reviews, settings, days);
}
