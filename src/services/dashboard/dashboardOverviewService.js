import { getRuntimeEnv } from '../core/runtimeEnv';
import { getReviews } from '../reviews/reviewsService';
import { getTasksSnapshot } from '../tasks/taskService';
import { getReportsSnapshot } from '../reports/reportService';
import { readConnectedIntegrations } from '../integrations/integrationService';
import { getProfileSnapshot } from '../profile/profileService';
import { getSubscriptionSnapshot } from '../subscriptions/subscriptionService';
import { readSecurityPreferences } from '../security/securityPreferencesService';
import { getSupportSnapshot } from '../support/supportService';
import { PIN_CODE_KEY } from '../../layouts/PortalLayout/constants';
import { apiRequest } from '../core/apiClient';
import { readScopedJson, writeScopedJson, removeScopedValue, getCompanyScope } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

export const DASHBOARD_OVERVIEW_CACHE_KEY = 'business-shield:dashboard:overview:v2';
export const DASHBOARD_OVERVIEW_CHANGED_EVENT = 'business-shield:dashboard-overview-changed';

const ENDPOINT = String(getRuntimeEnv('DASHBOARD_OVERVIEW_ENDPOINT')).replace(/\/$/, '');
const CACHE_TTL = 2 * 60 * 1000;
const VERSION = 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function readDashboardOverviewCache() {
  const cached = readScopedJson(DASHBOARD_OVERVIEW_CACHE_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
  if (!cached || cached.version !== VERSION || !cached.data) return null;
  if (cached.source === 'local-demo' && !isDemoDataEnabled()) {
    removeScopedValue(DASHBOARD_OVERVIEW_CACHE_KEY, { scope: getCompanyScope() });
    return null;
  }
  return cached;
}

function writeDashboardOverviewCache(data, source = 'api') {
  const fetchedAt = Date.now();
  const snapshot = {
    version: VERSION,
    source,
    fetchedAt,
    expiresAt: fetchedAt + CACHE_TTL,
    data,
  };
  writeScopedJson(DASHBOARD_OVERVIEW_CACHE_KEY, snapshot, { scope: getCompanyScope() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DASHBOARD_OVERVIEW_CHANGED_EVENT, { detail: snapshot }));
  }
  return snapshot;
}

function parseRuDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const source = String(value);
  const ru = source.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortChronological(items, field = 'date') {
  return [...items].sort((a, b) => {
    const left = parseRuDate(a?.[field])?.getTime() || 0;
    const right = parseRuDate(b?.[field])?.getTime() || 0;
    return left - right;
  });
}

function cumulativeSeries(items, pointsCount, getter = () => 1) {
  if (!items.length) return Array.from({ length: pointsCount }, () => 0);
  return Array.from({ length: pointsCount }, (_, index) => {
    const cut = Math.ceil(((index + 1) / pointsCount) * items.length);
    return items.slice(0, cut).reduce((sum, item) => sum + getter(item), 0);
  });
}

function buildRecentDayLabels(days = 7) {
  const formatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
  const today = startOfToday();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatter.format(date).replace('.', '').toUpperCase();
  });
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function buildTimeBuckets(items, { days, labels, field = 'date' }) {
  const end = startOfToday();
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const bucketMs = (days * 24 * 60 * 60 * 1000) / labels.length;
  const buckets = Array.from({ length: labels.length }, () => []);

  items.forEach((item) => {
    const date = parseRuDate(item?.[field] || item?.date || item?.createdAt);
    if (!date || date < start || date >= end) return;
    const index = Math.min(labels.length - 1, Math.max(0, Math.floor((date.getTime() - start.getTime()) / bucketMs)));
    buckets[index].push(item);
  });

  return { buckets, start, end };
}

function buildReviewsSeries(reviews, days, labels) {
  const { buckets } = buildTimeBuckets(reviews, { days, labels });
  const received = buckets.map((bucket) => bucket.length);
  const answered = buckets.map((bucket) => bucket.filter((item) => Boolean(item.reply) || item.status === 'done').length);
  const total = received.reduce((sum, value) => sum + value, 0);
  const answeredTotal = answered.reduce((sum, value) => sum + value, 0);
  const midpoint = Math.max(1, Math.floor(received.length / 2));
  const previous = received.slice(0, midpoint).reduce((sum, value) => sum + value, 0);
  const current = received.slice(midpoint).reduce((sum, value) => sum + value, 0);
  const growth = previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : current > 0 ? 100 : 0;
  return { labels, received, answered, total, answeredTotal, growth };
}

function buildRatingSeries(reviews, days, labels) {
  const numericReviews = reviews.filter((item) => Number.isFinite(Number(item.rating)));
  const { buckets } = buildTimeBuckets(numericReviews, { days, labels });
  const periodReviews = buckets.flat();
  const allCurrent = numericReviews.length
    ? Number((numericReviews.reduce((sum, item) => sum + Number(item.rating), 0) / numericReviews.length).toFixed(2))
    : 0;

  let running = [];
  const values = buckets.map((bucket) => {
    running = [...running, ...bucket];
    if (!running.length) return 0;
    return Number((running.reduce((sum, item) => sum + Number(item.rating), 0) / running.length).toFixed(2));
  });
  const positive = periodReviews.length ? Math.round((periodReviews.filter((item) => Number(item.rating) >= 4).length / periodReviews.length) * 100) : 0;
  const answered = periodReviews.length ? Math.round((periodReviews.filter((item) => Boolean(item.reply) || item.status === 'done').length / periodReviews.length) * 100) : 0;
  const firstNonZero = values.find((value) => value > 0) || 0;
  const lastNonZero = [...values].reverse().find((value) => value > 0) || 0;
  const growth = firstNonZero > 0 && lastNonZero > 0 ? Number((((lastNonZero - firstNonZero) / firstNonZero) * 100).toFixed(2)) : 0;
  return { labels, values, current: allCurrent, growth, reviews: periodReviews.length, totalReviews: numericReviews.length, positive, answered };
}

function buildTaskGroups(tasks, days = null) {
  const source = days ? tasks.filter((task) => countItemsSince([task], days) > 0) : tasks;
  const byType = new Map();
  source.forEach((task) => {
    const label = task.type || 'Без проекта';
    const current = byType.get(label) || { id: label.toLowerCase().replace(/\s+/g, '-'), label, total: 0, completed: 0, overdue: 0 };
    current.total += 1;
    if (task.status === 'done') current.completed += 1;
    const due = parseRuDate(task.dueDate);
    if (task.status !== 'done' && due && due.getTime() < Date.now()) current.overdue += 1;
    byType.set(label, current);
  });
  const tones = ['indigo', 'violet', 'purple', 'indigo', 'violet', 'purple'];
  return [...byType.values()].slice(0, 8).map((item, index) => ({ ...item, tone: tones[index % tones.length] }));
}

function taskProgress(task) {
  if (task.status === 'done') return 100;
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  if (checklist.length) {
    return Math.max(8, Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100));
  }
  if (task.status === 'progress') return 62;
  if (task.status === 'waiting') return 38;
  return 16;
}

function buildProcesses(tasks) {
  const statusMeta = {
    done: { status: 'Выполнено', badge: 'green', tone: 'green' },
    progress: { status: 'В работе', badge: 'violet', tone: 'violet' },
    waiting: { status: 'Ожидает', badge: 'orange', tone: 'orange' },
    new: { status: 'Новая', badge: 'neutral', tone: 'cyan' },
  };
  return tasks.slice(0, 4).map((task) => ({
    id: task.id,
    title: task.title,
    progress: taskProgress(task),
    date: task.dueDate || task.createdAt || '—',
    ...(statusMeta[task.status] || statusMeta.new),
  }));
}

function normalizeReports(reports, days = null) {
  const source = days ? reports.filter((item) => countItemsSince([item], days) > 0) : reports;
  const toneByStatus = { ready: 'violet', processing: 'orange', draft: 'orange', archived: 'gray' };
  return source.slice(0, 6).map((item) => ({
    id: item.id,
    title: item.title || 'Отчёт',
    date: item.date || '—',
    size: item.size || '—',
    status: item.status === 'ready' ? 'Готов' : item.status === 'processing' ? 'Формируется' : item.status === 'draft' ? 'Черновик' : item.status || 'Архив',
    tone: toneByStatus[item.status] || 'gray',
  }));
}

function memberInitials(member) {
  const source = String(member.name || `${member.firstName || ''} ${member.lastName || ''}` || member.email || '?').trim();
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function normalizeTeam(users = []) {
  return users.slice(0, 5).map((user, index) => ({
    id: user.id || user.email || `member-${index}`,
    initials: user.initials || memberInitials(user),
    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Участник команды',
    role: user.roleLabel || user.accessRoleLabel || user.role || 'Участник',
    tone: user.tone || ['violet', 'purple', 'orange', 'cyan'][index % 4],
    status: user.online ? 'online' : user.status === 'away' ? 'away' : 'offline',
  }));
}


function countItemsSince(items, days) {
  const now = Date.now();
  const threshold = now - days * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const date = parseRuDate(item.date || item.createdAt);
    return date && date.getTime() >= threshold && date.getTime() <= now + 24 * 60 * 60 * 1000;
  }).length;
}
function buildMetrics({ reviews, tasks, integrations, rating, profile, subscription, support }) {
  const pendingTasks = tasks.filter((item) => item.status !== 'done');
  const overdueTasks = pendingTasks.filter((item) => {
    const due = parseRuDate(item.dueDate);
    return due && due.getTime() < Date.now();
  });
  const answered = reviews.filter((item) => Boolean(item.reply) || item.status === 'done').length;
  const reviewCount = reviews.length;
  const configuredSupportChannels = Array.isArray(support?.channels) ? support.channels : [];
  const supportChannels = configuredSupportChannels.length || ['email', 'telegram', 'push'].filter((id) => profile?.personal?.notifications?.[id] !== false).length || 0;
  return {
    tasks: {
      value: tasks.length,
      trend: null,
      caption: overdueTasks.length ? `${overdueTasks.length} требуют внимания` : `${pendingTasks.length} в работе`,
      spark: cumulativeSeries(sortChronological(tasks, 'createdAt'), 7),
    },
    rating: {
      value: rating.current || null,
      trend: rating.growth ? { value: rating.growth, tone: rating.growth >= 0 ? 'positive' : 'negative' } : null,
      caption: rating.current ? `${rating.totalReviews ?? rating.reviews ?? 0} оценок` : 'ожидаем данные',
      spark: rating.values.map((value) => Math.round(value * 20)),
    },
    reviews: {
      value: reviewCount,
      byPeriod: { day: countItemsSince(reviews, 1), week: countItemsSince(reviews, 7), month: countItemsSince(reviews, 31), year: countItemsSince(reviews, 366), all: reviewCount },
      trend: null,
      caption: answered ? `${answered} обработано` : 'ожидают обработки',
      spark: cumulativeSeries(sortChronological(reviews), 7),
    },
    shield: {
      active: integrations.length > 0,
      caption: integrations.length ? `${integrations.length} источника подключено` : 'подключите площадки',
      spark: [],
    },
    support: {
      channelsOnline: supportChannels,
      responseMinutes: null,
      spark: [],
    },
    subscription: {
      activeUntil: subscription?.plan?.activeUntil || null,
      planName: subscription?.plan?.name || '',
      status: subscription?.plan?.activeUntil && parseRuDate(subscription.plan.activeUntil)?.getTime() < Date.now() ? 'expired' : subscription?.plan ? 'active' : 'unknown',
      connectedCount: integrations.length,
      spark: [],
    },
  };
}

function buildPulse({ reviews, tasks, integrations, rating }) {
  const answeredCoverage = reviews.length ? Math.round((reviews.filter((item) => Boolean(item.reply) || item.status === 'done').length / reviews.length) * 100) : 0;
  const negativeShare = reviews.length ? Math.round((reviews.filter((item) => Number(item.rating) <= 2).length / reviews.length) * 100) : 0;
  const overdue = tasks.filter((item) => item.status !== 'done' && parseRuDate(item.dueDate)?.getTime() < Date.now()).length;
  const taskHealth = tasks.length ? Math.max(0, 100 - Math.round((overdue / tasks.length) * 100)) : 100;
  const hasReputationData = reviews.length > 0 || rating.current > 0;
  const ratingScore = rating.current ? (rating.current / 5) * 100 : 0;
  const integrationScore = integrations.length ? Math.min(100, integrations.length * 20) : 0;
  const measuredWeights = [
    rating.current ? { value: ratingScore, weight: .36 } : null,
    reviews.length ? { value: answeredCoverage, weight: .28 } : null,
    tasks.length ? { value: taskHealth, weight: .18 } : null,
    integrations.length ? { value: integrationScore, weight: .18 } : null,
  ].filter(Boolean);
  const weightTotal = measuredWeights.reduce((sum, item) => sum + item.weight, 0);
  const score = weightTotal ? Math.round(measuredWeights.reduce((sum, item) => sum + item.value * item.weight, 0) / weightTotal) : 0;
  return {
    measured: weightTotal > 0,
    score: clamp(score, 0, 100),
    status: !hasReputationData && !tasks.length && !integrations.length ? 'Недостаточно данных' : score >= 86 ? 'Стабильный рост' : score >= 70 ? 'Стабильное состояние' : 'Требует внимания',
    spark: hasReputationData ? rating.values.filter((value) => value > 0).map((value) => Math.round(value * 20)) : [],
    signals: [
      { id: 'negative', label: 'Негатив', value: `${negativeShare}%`, caption: 'доля низких оценок', tone: negativeShare <= 20 ? 'green' : 'orange' },
      { id: 'answers', label: 'Ответы', value: `${answeredCoverage}%`, caption: 'охват отзывов', tone: answeredCoverage >= 80 ? 'violet' : 'orange' },
      { id: 'platforms', label: 'Площадки', value: String(integrations.length), caption: 'подключено', tone: 'cyan' },
    ],
  };
}

export async function buildLocalDashboardOverview(signal) {
  const safe = async (promise, fallback) => {
    try { return await promise; } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return fallback;
    }
  };
  const [reviewResult, tasksSnapshot, reportsSnapshot, profile, subscriptionState, support] = await Promise.all([
    safe(getReviews({ signal, pageSize: 100 }), { items: [] }),
    safe(getTasksSnapshot({ signal }), { tasks: [] }),
    safe(getReportsSnapshot({ signal }), { reports: [] }),
    safe(getProfileSnapshot({ signal }), { users: [], personal: {}, sessions: [] }),
    safe(getSubscriptionSnapshot({ signal }), { snapshot: null }),
    safe(getSupportSnapshot({ signal }), { channels: [] }),
  ]);
  const reviews = Array.isArray(reviewResult?.items) ? reviewResult.items : [];
  const tasks = Array.isArray(tasksSnapshot?.tasks) ? tasksSnapshot.tasks : [];
  const reports = Array.isArray(reportsSnapshot?.reports) ? reportsSnapshot.reports : [];
  const integrations = readConnectedIntegrations();
  const securityPreferences = readSecurityPreferences();
  const hasPin = typeof window !== 'undefined' && Boolean(localStorage.getItem(PIN_CODE_KEY));
  const activeSessions = Array.isArray(profile?.sessions) ? profile.sessions.filter((session) => session.revoked !== true).length : 0;
  const securityScore = Math.min(100, (hasPin ? 45 : 0) + (securityPreferences.autoLock ? 30 : 0) + (activeSessions <= 3 ? 15 : 5) + 10);
  const subscription = subscriptionState?.snapshot || null;
  const weekLabels = buildRecentDayLabels(7);
  const ratingWeek = buildRatingSeries(reviews, 7, weekLabels);
  const ratingMonth = buildRatingSeries(reviews, 28, ['1 НЕД', '2 НЕД', '3 НЕД', '4 НЕД']);
  const taskGroupsWeek = buildTaskGroups(tasks, 7);
  const taskGroupsMonth = buildTaskGroups(tasks, 31);
  const taskGroupsQuarter = buildTaskGroups(tasks, 92);
  const monthReviews = buildReviewsSeries(reviews, 28, ['1 НЕД', '2 НЕД', '3 НЕД', '4 НЕД']);
  const weekReviews = buildReviewsSeries(reviews, 7, weekLabels);

  const overview = {
    generatedAt: new Date().toISOString(),
    metrics: null,
    pulse: null,
    reviews: { month: monthReviews, week: weekReviews },
    tasks: { week: taskGroupsWeek, month: taskGroupsMonth, quarter: taskGroupsQuarter },
    rating: { week: ratingWeek, month: ratingMonth },
    processes: buildProcesses(tasks),
    reports: {
      month: normalizeReports(reports, 31),
      quarter: normalizeReports(reports, 92),
    },
    competitors: { month: [], week: [], insight: '' },
    team: normalizeTeam(profile?.users || []),
    security: {
      score: securityScore,
      hasPin,
      autoLock: securityPreferences.autoLock,
      sessionMinutes: securityPreferences.sessionMinutes,
      activeSessions,
      status: securityScore >= 85 ? 'Аккаунт защищён' : securityScore >= 65 ? 'Защита настроена частично' : 'Требует настройки',
    },
    integrations,
  };
  overview.metrics = buildMetrics({ reviews, tasks, integrations, rating: ratingWeek, profile, subscription, support });
  overview.pulse = buildPulse({ reviews, tasks, integrations, rating: ratingWeek });
  return overview;
}

function createEmptyDashboardOverview() {
  return {
    generatedAt: new Date().toISOString(),
    metrics: {},
    pulse: { measured: false, score: 0, status: 'Недостаточно данных', spark: [], signals: [] },
    reviews: {},
    tasks: {},
    rating: {},
    processes: [],
    reports: {},
    competitors: { month: [], week: [], insight: '' },
    team: [],
    security: {},
    integrations: [],
  };
}

function mergeSection(local, remote) {
  if (Array.isArray(remote)) return remote;
  if (!remote || typeof remote !== 'object') return local;
  return { ...(local || {}), ...remote };
}

export function normalizeDashboardOverview(remote, local) {
  if (!remote || typeof remote !== 'object') return local;
  return {
    ...local,
    ...remote,
    metrics: mergeSection(local.metrics, remote.metrics),
    pulse: mergeSection(local.pulse, remote.pulse),
    reviews: mergeSection(local.reviews, remote.reviews),
    tasks: mergeSection(local.tasks, remote.tasks),
    rating: mergeSection(local.rating, remote.rating),
    reports: mergeSection(local.reports, remote.reports),
    competitors: mergeSection(local.competitors, remote.competitors),
    security: mergeSection(local.security, remote.security),
    team: Array.isArray(remote.team) ? remote.team : local.team,
    processes: Array.isArray(remote.processes) ? remote.processes : local.processes,
    integrations: Array.isArray(remote.integrations) ? remote.integrations : local.integrations,
  };
}

async function requestOverview(signal) {
  if (!ENDPOINT) return null;
  return apiRequest(ENDPOINT, { signal, timeout: 8000 });
}

export function isDashboardOverviewApiEnabled() {
  return Boolean(ENDPOINT);
}

export async function getDashboardOverview({ signal, force = false } = {}) {
  const cached = readDashboardOverviewCache();

  // Without an aggregate API the browser modules are the source of truth.
  if (!ENDPOINT) {
    const local = await buildLocalDashboardOverview(signal);
    const source = isDemoDataEnabled() ? 'local-demo' : 'local';
    const snapshot = writeDashboardOverviewCache(local, source);
    return { data: local, source, stale: false, fetchedAt: snapshot.fetchedAt, error: null };
  }

  if (!force && cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, source: 'cache', stale: false, fetchedAt: cached.fetchedAt, error: null };
  }

  // In production the aggregate dashboard endpoint is requested first. This
  // avoids six or seven duplicate module requests on every Dashboard refresh.
  try {
    const payload = await requestOverview(signal);
    const remoteData = payload?.data || payload?.overview || payload;
    const normalized = normalizeDashboardOverview(remoteData, cached?.data || createEmptyDashboardOverview());
    const snapshot = writeDashboardOverviewCache(normalized, 'api');
    return { data: normalized, source: 'api', stale: false, fetchedAt: snapshot.fetchedAt, error: null };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (cached?.data) {
      return {
        data: cached.data,
        source: 'cache',
        stale: true,
        fetchedAt: cached.fetchedAt,
        error,
      };
    }

    // If the aggregate endpoint is unavailable on a first load, try the
    // feature services once. They have their own scoped caches/offline policy.
    const local = await buildLocalDashboardOverview(signal);
    const snapshot = writeDashboardOverviewCache(local, 'modules-fallback');
    return {
      data: local,
      source: 'modules-fallback',
      stale: true,
      fetchedAt: snapshot.fetchedAt,
      error,
    };
  }
}

export function clearDashboardOverviewCache() {
  if (typeof window === 'undefined') return;
  removeScopedValue(DASHBOARD_OVERVIEW_CACHE_KEY, { scope: getCompanyScope() });
}
