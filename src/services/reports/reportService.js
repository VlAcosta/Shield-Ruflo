import { getRuntimeEnv } from '../core/runtimeEnv';
import { DEFAULT_REPORTS_SNAPSHOT } from '../../features/reports/model/reportData';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const REPORTS_ENDPOINT = String(getRuntimeEnv('REPORTS_ENDPOINT', '/api/v1/reports')).replace(/\/$/, '');
const REPORTS_CACHE_KEY = 'business-shield:reports:snapshot:v2';
export const REPORTS_CHANGED_EVENT = 'business-shield:reports-changed';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readCache() {
  return readScopedJson(REPORTS_CACHE_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
}

function writeCache(snapshot, { emit = true } = {}) {
  writeScopedJson(REPORTS_CACHE_KEY, snapshot, { scope: getCompanyScope() });
  if (emit && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REPORTS_CHANGED_EVENT, { detail: snapshot }));
}

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(REPORTS_ENDPOINT, path), {
    ...options,
    timeout: 10000,
    responseType: options.responseType || 'json',
  });
}

function normalizeReport(report = {}) {
  const start = report.periodStart ? new Date(report.periodStart) : null;
  const end = report.periodEnd ? new Date(report.periodEnd) : null;
  const created = report.generatedAt || report.createdAt;
  const status = String(report.status || '').toUpperCase();
  return {
    ...report,
    title: report.title || 'Отчёт по репутации',
    period: start && end
      ? `${start.toLocaleDateString('ru-RU')} — ${end.toLocaleDateString('ru-RU')}`
      : report.period || '',
    date: created ? new Date(created).toLocaleDateString('ru-RU') : '',
    size: status === 'READY' ? 'Готов' : status === 'FAILED' ? 'Ошибка' : 'Формируется',
    status: status === 'READY' ? 'ready' : status === 'FAILED' ? 'failed' : 'processing',
    type: report.type || 'Репутация',
    metrics: report.data ? [
      { id: 'rating', label: 'Общий рейтинг', value: report.data.averageRating ?? '—', tone: 'violet' },
      { id: 'reviews', label: 'Отзывов получено', value: report.data.reviewCount ?? 0, tone: 'cyan' },
      { id: 'answers', label: 'Покрытие ответами', value: `${report.data.responseCoverage ?? 0}%`, tone: 'green' },
    ] : [],
  };
}

function normalizeSnapshot(remote) {
  const source = remote?.snapshot || remote || {};
  return {
    ...source,
    reports: (source.reports || []).map(normalizeReport),
    schedules: Array.isArray(source.schedules) ? source.schedules : [],
  };
}

function periodRange(payload = {}) {
  const end = new Date();
  end.setMilliseconds(0);

  if (payload.period === 'custom') {
    const start = new Date(`${payload.customFrom}T00:00:00.000Z`);
    const customEnd = new Date(`${payload.customTo}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(customEnd.getTime()) || start >= customEnd) {
      throw new Error('Некорректный период отчёта');
    }
    return { start, end: customEnd };
  }

  const days = payload.period === 'week' ? 7 : payload.period === 'quarter' ? 90 : 30;
  return { start: new Date(end.getTime() - days * 86_400_000), end };
}

export async function getReportsSnapshot({ signal } = {}) {
  try {
    const snapshot = normalizeSnapshot(await request('', { signal }));
    writeCache(snapshot, { emit: false });
    return snapshot;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const cached = readCache();
    if (cached) return { ...cached, stale: true, error };
    if (isDemoDataEnabled()) return clone(DEFAULT_REPORTS_SNAPSHOT);
    throw error;
  }
}

export async function generateReport(payload, snapshot) {
  const { start, end } = periodRange(payload);
  const type = payload.period === 'week'
    ? 'weekly_reputation'
    : payload.period === 'month'
      ? 'monthly_reputation'
      : 'custom';

  const remote = await request('/generate', {
    method: 'POST',
    body: {
      type,
      title: `Отчёт по репутации · ${payload.periodLabel || 'Период'}`,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      requestedBlocks: payload.blocks || [],
    },
    idempotencyKey: createIdempotencyKey('report-generate'),
  });

  const report = normalizeReport(remote?.report || remote);
  const nextSnapshot = {
    ...(snapshot || { reports: [], schedules: [] }),
    reports: [report, ...(snapshot?.reports || []).filter((item) => item.id !== report.id)],
  };
  writeCache(nextSnapshot);
  return { ...remote, report, snapshot: nextSnapshot };
}

export async function updateReportSchedules(schedules, snapshot) {
  const remote = await request('/schedules', {
    method: 'PUT',
    body: { schedules },
  });
  const nextSnapshot = {
    ...(snapshot || { reports: [] }),
    schedules: remote?.schedules || [],
  };
  writeCache(nextSnapshot);
  return { ...remote, snapshot: nextSnapshot };
}

export async function downloadReport(reportId, cachedReport) {
  const remote = await request(`/${reportId}`, { method: 'GET' });
  const report = normalizeReport(remote?.report || remote || cachedReport);
  if (report.status !== 'ready' || !report.data) {
    throw new Error(report.status === 'failed' ? 'Формирование отчёта завершилось с ошибкой' : 'Отчёт ещё формируется');
  }

  const data = report.data;
  const content = [
    'БИЗНЕС ЩИТ',
    report.title,
    report.period,
    '',
    `Отзывов: ${data.reviewCount ?? 0}`,
    `Средний рейтинг: ${data.averageRating ?? 'нет данных'}`,
    `Позитивные: ${data.positiveShare ?? 0}%`,
    `Негативные: ${data.negativeShare ?? 0}%`,
    `Покрытие ответами: ${data.responseCoverage ?? 0}%`,
    '',
    `Сформировано: ${report.generatedAt ? new Date(report.generatedAt).toLocaleString('ru-RU') : '—'}`,
  ].join('\n');

  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}
