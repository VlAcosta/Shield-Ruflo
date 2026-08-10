import { AUTOMATION_TEMPLATES } from '../../features/automations/model';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const AUTOMATIONS_ENDPOINT = String(getRuntimeEnv('AUTOMATIONS_ENDPOINT', '/api/v1/automations')).replace(/\/$/, '');
const RULES_KEY = 'business-shield:automations:rules:v2';
const LOG_KEY = 'business-shield:automations:log:v2';
export const AUTOMATIONS_CHANGED_EVENT = 'business-shield:automations-changed';
export const AUTOMATIONS_LOG_EVENT = 'business-shield:automations-log';

const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizeRule(rule = {}) {
  const conditions = rule.conditions && typeof rule.conditions === 'object' ? rule.conditions : {};
  return {
    id: rule.id || `automation-${Date.now().toString(36)}`,
    name: String(rule.name || 'Новая автоматизация').slice(0, 180),
    description: String(rule.description || '').slice(0, 500),
    enabled: rule.enabled !== false,
    trigger: rule.trigger || 'review.received',
    conditions: {
      ratingMin: Number(conditions.ratingMin ?? conditions.rating_min ?? 1),
      ratingMax: Number(conditions.ratingMax ?? conditions.rating ?? 5),
      platforms: Array.isArray(conditions.platforms) ? conditions.platforms : [],
      reasons: Array.isArray(conditions.reasons) ? conditions.reasons : [],
      ...conditions,
    },
    actions: Array.isArray(rule.actions)
      ? rule.actions.map((action) => typeof action === 'string' ? action : action?.type).filter(Boolean)
      : ['notify'],
    priority: rule.priority || conditions.priority || 'high',
    systemTemplate: Boolean(rule.systemTemplate),
    createdAt: rule.createdAt || new Date().toISOString(),
    updatedAt: rule.updatedAt || new Date().toISOString(),
    executions: Array.isArray(rule.executions) ? rule.executions : [],
  };
}

function normalizeExecution(execution, rule) {
  return {
    id: execution.id,
    createdAt: execution.startedAt || execution.createdAt || new Date().toISOString(),
    ruleId: rule.id,
    ruleName: rule.name,
    trigger: rule.trigger,
    targetId: execution.triggerPayload?.review?.id || '',
    targetLabel: execution.triggerPayload?.review?.author || 'Репутационное событие',
    status: String(execution.status || '').toUpperCase() === 'SUCCESS' ? 'success' : String(execution.status || '').toUpperCase() === 'FAILED' ? 'error' : 'running',
    effects: Array.isArray(execution.actionResult) ? execution.actionResult.map((item) => item?.type).filter(Boolean) : [],
    error: execution.errorMessage || '',
  };
}

function emit(rules, log) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTOMATIONS_CHANGED_EVENT, { detail: clone(rules) }));
  window.dispatchEvent(new CustomEvent(AUTOMATIONS_LOG_EVENT, { detail: clone(log) }));
}

function writeSnapshot(rules) {
  const normalized = (rules || []).map(normalizeRule);
  const log = normalized.flatMap((rule) => rule.executions.map((execution) => normalizeExecution(execution, rule)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 120);
  writeScopedJson(RULES_KEY, normalized, { scope: getCompanyScope() });
  writeScopedJson(LOG_KEY, log, { scope: getCompanyScope() });
  emit(normalized, log);
  return normalized;
}

function seedRules() {
  return AUTOMATION_TEMPLATES.map((rule) => normalizeRule({ ...rule, id: `rule-${rule.id}`, systemTemplate: true }));
}

export function readAutomationRules() {
  const saved = readScopedJson(RULES_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
  if (Array.isArray(saved)) return saved.map(normalizeRule);
  return isDemoDataEnabled() ? seedRules() : [];
}

export function readAutomationLog() {
  const value = readScopedJson(LOG_KEY, { scope: getCompanyScope(), legacy: false, fallback: [] });
  return Array.isArray(value) ? value : [];
}

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(AUTOMATIONS_ENDPOINT, path), { ...options, timeout: 10000 });
}

export async function fetchAutomationSnapshot({ signal } = {}) {
  try {
    const remote = await request('', { signal });
    const rules = writeSnapshot(remote?.automations || []);
    return { rules, log: readAutomationLog(), source: 'api' };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const cached = readAutomationRules();
    if (cached.length) return { rules: cached, log: readAutomationLog(), source: 'cache', stale: true, error };
    if (isDemoDataEnabled()) return { rules: seedRules(), log: [], source: 'demo' };
    throw error;
  }
}

function apiPayload(rule) {
  const normalized = normalizeRule(rule);
  return {
    name: normalized.name,
    description: normalized.description,
    trigger: normalized.trigger,
    conditions: { ...normalized.conditions, priority: normalized.priority },
    actions: normalized.actions,
    enabled: normalized.enabled,
  };
}

export async function saveAutomationRule(input) {
  const isPersisted = Boolean(input?.id && !String(input.id).startsWith('rule-') && !String(input.id).startsWith('automation-'));
  const remote = await request(isPersisted ? `/${input.id}` : '', {
    method: isPersisted ? 'PATCH' : 'POST',
    body: apiPayload(input),
    idempotencyKey: isPersisted ? undefined : createIdempotencyKey('automation-create'),
  });
  const saved = normalizeRule(remote?.automation || remote);
  await fetchAutomationSnapshot();
  return saved;
}

export async function deleteAutomationRule(ruleId) {
  await request(`/${ruleId}`, { method: 'DELETE' });
  const snapshot = await fetchAutomationSnapshot();
  return snapshot.rules;
}

export async function toggleAutomationRule(ruleId, enabled) {
  await request(`/${ruleId}`, { method: 'PATCH', body: { enabled: Boolean(enabled) } });
  const snapshot = await fetchAutomationSnapshot();
  return snapshot.rules;
}

export function createRuleFromTemplate(templateId) {
  const template = AUTOMATION_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;
  return normalizeRule({
    ...template,
    id: `automation-${templateId}-${Date.now().toString(36)}`,
    systemTemplate: false,
    enabled: true,
  });
}

export async function evaluateReviewAutomations({ reason = 'manual' } = {}) {
  const result = await request('/run', {
    method: 'POST',
    body: { reason },
    idempotencyKey: createIdempotencyKey(`automation-run-${reason}`),
  });
  await fetchAutomationSnapshot();
  return result;
}
