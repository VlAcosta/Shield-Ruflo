import { getRuntimeEnv } from '../core/runtimeEnv';
import { DEFAULT_REPORTS_SNAPSHOT } from '../../features/reports/model/reportData';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const REPORTS_ENDPOINT = String(getRuntimeEnv('REPORTS_ENDPOINT')).replace(/\/$/, '');
const REPORTS_CACHE_KEY = 'business-shield:reports:snapshot:v1';
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
  if (!REPORTS_ENDPOINT) return null;
  return apiRequest(joinEndpoint(REPORTS_ENDPOINT, path), {
    ...options,
    timeout: 10000,
    responseType: options.responseType || 'json',
  });
}

export async function getReportsSnapshot({ signal } = {}) {
  try {
    const remote = await request('', { signal });
    if (remote) {
      const snapshot = remote.snapshot || remote;
      writeCache(snapshot, { emit: false });
      return snapshot;
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const cached = readCache();
    if (cached) return cached;
  }
  return readCache() || (isDemoDataEnabled() ? clone(DEFAULT_REPORTS_SNAPSHOT) : { reports: [], schedules: [] });
}

export async function generateReport(payload, snapshot) {
  const remote = await request('/generate', {
    method: 'POST',
    body: payload,
    idempotencyKey: createIdempotencyKey('report-generate'),
  });

  if (remote) {
    const next = remote.snapshot || (remote.reports ? remote : null);
    if (next) writeCache(next);
    return remote;
  }

  const now = new Date();
  const report = {
    id: `local-${now.getTime()}`,
    title: `Новый отчёт · ${payload.periodLabel}`,
    period: payload.periodLabel,
    date: now.toLocaleDateString('ru-RU'),
    size: 'Формируется',
    status: 'processing',
    type: 'Сводный',
  };

  const nextSnapshot = {
    ...snapshot,
    reports: [report, ...snapshot.reports],
  };

  writeCache(nextSnapshot);
  return { report, snapshot: nextSnapshot };
}

export async function updateReportSchedules(schedules, snapshot) {
  const remote = await request('/schedules', {
    method: 'PUT',
    body: { schedules },
  });

  if (remote) {
    const next = remote.snapshot || (remote.schedules ? remote : null);
    if (next) writeCache(next);
    return remote;
  }

  const nextSnapshot = { ...snapshot, schedules };
  writeCache(nextSnapshot);
  return { schedules, snapshot: nextSnapshot };
}

export async function downloadReport(reportId, report) {
  const remote = await request(`/${reportId}/download`, { method: 'GET', responseType: 'blob' });

  if (remote instanceof Blob) return remote;

  const content = [
    'БИЗНЕС ЩИТ',
    report?.title || 'Отчёт',
    report?.period || '',
    report?.date || '',
  ].filter(Boolean).join('\n');

  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}
