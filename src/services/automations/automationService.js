import { AUTOMATION_TEMPLATES } from '../../features/automations/model';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { getCachedReviews, updateReview } from '../reviews/reviewsService';
import { getReviewSettings, getReviewSla, submitDraftForApproval, delegateReviewToShield } from '../reviews/reviewIntelligenceService';
import { getTasksSnapshot, createTask } from '../tasks/taskService';
import { pushLocalNotification } from '../notifications/notificationService';
import { recordCompanyActivity } from '../activity/companyActivityService';
import { buildReputationAnalytics } from '../reputation/reputationAnalyticsService';

const RULES_KEY = 'business-shield:automations:rules:v1';
const LEDGER_KEY = 'business-shield:automations:ledger:v1';
const LOG_KEY = 'business-shield:automations:log:v1';
export const AUTOMATIONS_CHANGED_EVENT = 'business-shield:automations-changed';
export const AUTOMATIONS_LOG_EVENT = 'business-shield:automations-log';
const MAX_LOG = 120;

const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizeRule(rule = {}) {
  return {
    id: rule.id || `automation-${Date.now().toString(36)}`,
    name: String(rule.name || 'Новая автоматизация').slice(0, 72),
    description: String(rule.description || '').slice(0, 220),
    enabled: rule.enabled !== false,
    trigger: rule.trigger || 'review.received',
    conditions: {
      ratingMin: Number(rule.conditions?.ratingMin || 1),
      ratingMax: Number(rule.conditions?.ratingMax || 5),
      platforms: Array.isArray(rule.conditions?.platforms) ? rule.conditions.platforms : [],
      reasons: Array.isArray(rule.conditions?.reasons) ? rule.conditions.reasons : [],
    },
    actions: Array.isArray(rule.actions) ? rule.actions : ['notify'],
    priority: rule.priority || 'high',
    systemTemplate: Boolean(rule.systemTemplate),
    createdAt: rule.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function seedRules() {
  return AUTOMATION_TEMPLATES.map((rule) => normalizeRule({ ...rule, id: `rule-${rule.id}`, systemTemplate: true }));
}

export function readAutomationRules() {
  const saved = readScopedJson(RULES_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
  if (Array.isArray(saved)) return saved.map(normalizeRule);
  const seeded = seedRules();
  writeScopedJson(RULES_KEY, seeded, { scope: getCompanyScope() });
  return seeded;
}

function writeRules(rules) {
  writeScopedJson(RULES_KEY, rules, { scope: getCompanyScope() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUTOMATIONS_CHANGED_EVENT, { detail: clone(rules) }));
  return rules;
}

export function saveAutomationRule(input) {
  const rules = readAutomationRules();
  const rule = normalizeRule(input);
  const exists = rules.some((item) => item.id === rule.id);
  const next = exists ? rules.map((item) => item.id === rule.id ? rule : item) : [rule, ...rules];
  writeRules(next);
  recordCompanyActivity({ type: 'automation-rule', title: exists ? 'Изменена автоматизация' : 'Создана автоматизация', detail: rule.name, route: '/automations', tone: 'violet' });
  return clone(rule);
}

export function deleteAutomationRule(ruleId) {
  const next = readAutomationRules().filter((item) => item.id !== ruleId);
  writeRules(next);
  return next;
}

export function toggleAutomationRule(ruleId, enabled) {
  const next = readAutomationRules().map((item) => item.id === ruleId ? { ...item, enabled: Boolean(enabled), updatedAt: new Date().toISOString() } : item);
  writeRules(next);
  return next;
}

export function createRuleFromTemplate(templateId) {
  const template = AUTOMATION_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;
  return normalizeRule({ ...template, id: `automation-${templateId}-${Date.now().toString(36)}`, systemTemplate: false, enabled: true, name: template.name });
}

function readLedger() {
  const value = readScopedJson(LEDGER_KEY, { scope: getCompanyScope(), legacy: false, fallback: {} });
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function claimExecution(key) {
  const ledger = readLedger();
  if (ledger[key]) return false;
  ledger[key] = new Date().toISOString();
  const entries = Object.entries(ledger).slice(-600);
  writeScopedJson(LEDGER_KEY, Object.fromEntries(entries), { scope: getCompanyScope() });
  return true;
}

function releaseExecution(key) {
  const ledger = readLedger();
  if (!ledger[key]) return;
  delete ledger[key];
  writeScopedJson(LEDGER_KEY, ledger, { scope: getCompanyScope() });
}

function appendLog(item) {
  const current = readScopedJson(LOG_KEY, { scope: getCompanyScope(), legacy: false, fallback: [] });
  const log = [{ id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), ...item }, ...(Array.isArray(current) ? current : [])].slice(0, MAX_LOG);
  writeScopedJson(LOG_KEY, log, { scope: getCompanyScope() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUTOMATIONS_LOG_EVENT, { detail: clone(log) }));
  return log[0];
}

export function readAutomationLog() {
  const value = readScopedJson(LOG_KEY, { scope: getCompanyScope(), legacy: false, fallback: [] });
  return Array.isArray(value) ? value : [];
}

function matchesRule(rule, review) {
  if (!review) return false;
  const rating = Number(review.rating || 0);
  if (rating < rule.conditions.ratingMin || rating > rule.conditions.ratingMax) return false;
  if (rule.conditions.platforms.length && !rule.conditions.platforms.includes(review.platform)) return false;
  if (rule.conditions.reasons.length) {
    const reasons = new Set([...(review.aiReasons || []), ...(review.tags || [])]);
    if (!rule.conditions.reasons.some((reason) => reasons.has(reason))) return false;
  }
  return true;
}

function notificationFor(rule, review, trigger) {
  if (trigger === 'review.sla_breached') return { title: `SLA нарушен · ${review.platform}`, text: `${review.rating}★ · ${review.author}. Нужна немедленная реакция.`, tone: 'red' };
  if (trigger === 'review.sla_at_risk') return { title: `SLA под риском · ${review.platform}`, text: `${review.rating}★ · использовано более 75% времени ответа.`, tone: 'amber' };
  if (trigger === 'review.approval_waiting') return { title: 'Ответ ждёт согласования', text: `${review.platform} · ${review.author}. Черновик ожидает решения руководителя.`, tone: 'violet' };
  return { title: `Новый негативный отзыв · ${review.platform}`, text: `${review.rating}★ · ${review.author}. Автоматизация «${rule.name}» запущена.`, tone: 'red' };
}

async function createGenericAutomationTask(rule, review, trigger) {
  const snapshot = await getTasksSnapshot();
  const existing = (snapshot.tasks || []).find((task) => task.sourceReviewId === review.id && (trigger === 'review.received' || task.automationTrigger === trigger));
  if (existing) return existing.id;
  const settings = await getReviewSettings().catch(() => null);
  const sla = getReviewSla(review, settings);
  const title = trigger === 'review.sla_breached'
    ? `Срочно: просрочен SLA · ${review.platform}`
    : trigger === 'review.received' ? `Обработать отзыв ${review.rating}★ · ${review.platform}` : `Реакция по отзыву · ${review.platform}`;
  const remainingHours = trigger === 'review.received' ? Math.max(1, Number(sla?.remainingHours || (Number(review.rating) <= 2 ? 6 : 16))) : (rule.priority === 'critical' ? 2 : 6);
  const due = new Date(Date.now() + remainingHours * 3600000);
  const result = await createTask({
    title,
    type: 'Отзывы', priority: rule.priority, status: 'new', dueDate: due.toLocaleDateString('ru-RU'),
    description: `${review.rating}★ · ${review.author}\n${review.text || ''}`,
    sourceReviewId: review.id,
    automationRuleId: rule.id,
    automationTrigger: trigger,
    comments: [{ id: `auto-${Date.now()}`, author: 'Автоматизация', initials: 'АВ', text: `Создано правилом «${rule.name}»`, time: 'сейчас' }],
    checklist: [{ id: `check-${Date.now()}-1`, text: 'Проверить контекст отзыва', done: false }, { id: `check-${Date.now()}-2`, text: 'Подготовить действие', done: false }], attachments: [],
  }, snapshot);
  if (result?.task?.id && !review.taskId) await updateReview(review.id, { taskId: result.task.id });
  return result?.task?.id || '';
}

async function executeRule(rule, review, trigger) {
  const key = `${rule.id}:${trigger}:${review?.id || 'signal'}`;
  if (!claimExecution(key)) return null;
  const effects = [];
  try {
    for (const action of rule.actions) {
      if (action === 'create_task' && review) effects.push({ type: action, value: await createGenericAutomationTask(rule, review, trigger) });
      if (action === 'notify' && review) {
        const payload = notificationFor(rule, review, trigger);
        effects.push({ type: action, value: pushLocalNotification({ ...payload, type: 'reviews', actionLabel: 'Открыть отзыв', actionRoute: `/reviews?review=${review.id}` }).id });
      }
      if (action === 'send_for_approval' && review?.reply) effects.push({ type: action, value: await submitDraftForApproval(review.id, review.reply) });
      if (action === 'assign_shield' && review) effects.push({ type: action, value: await delegateReviewToShield(review.id, 'Передано автоматическим правилом') });
    }
    appendLog({ ruleId: rule.id, ruleName: rule.name, trigger, targetId: review?.id || '', targetLabel: review ? `${review.platform} · ${review.rating}★ · ${review.author}` : 'Репутационный сигнал', status: 'success', effects: effects.map((item) => item.type) });
    recordCompanyActivity({ type: 'automation-run', title: 'Сработала автоматизация', detail: rule.name, route: '/automations', targetId: review?.id || '', tone: 'success' });
    return effects;
  } catch (error) {
    releaseExecution(key);
    appendLog({ ruleId: rule.id, ruleName: rule.name, trigger, targetId: review?.id || '', targetLabel: review ? `${review.platform} · ${review.rating}★` : 'Репутационный сигнал', status: 'error', error: error?.message || 'Ошибка выполнения' });
    return null;
  }
}

export async function evaluateReviewAutomations({ reviews = getCachedReviews(), reason = 'manual' } = {}) {
  const rules = readAutomationRules().filter((rule) => rule.enabled);
  const settings = await getReviewSettings().catch(() => null);
  const now = Date.now();
  const executions = [];
  for (const review of reviews) {
    for (const rule of rules) {
      if (!matchesRule(rule, review)) continue;
      let triggered = false;
      if (rule.trigger === 'review.received') triggered = review.status !== 'done';
      if (rule.trigger === 'review.sla_at_risk') { const sla = getReviewSla(review, settings); triggered = !sla.overdue && sla.progress >= 75 && review.workflowStatus !== 'published'; }
      if (rule.trigger === 'review.sla_breached') { const sla = getReviewSla(review, settings); triggered = sla.overdue && review.workflowStatus !== 'published'; }
      if (rule.trigger === 'review.approval_waiting') triggered = review.workflowStatus === 'approval' && now - new Date(review.approval?.requestedAt || now).getTime() >= 4 * 3600000;
      if (triggered) executions.push(executeRule(rule, review, rule.trigger));
    }
  }

  const spikeRules = rules.filter((rule) => rule.trigger === 'reputation.reason_spike');
  if (spikeRules.length) {
    const analytics = buildReputationAnalytics(reviews, settings, 30);
    const spike = analytics.reasons.find((item) => item.count >= 2 && item.delta >= 50);
    if (spike) {
      for (const rule of spikeRules) {
        if (rule.conditions.reasons.length && !rule.conditions.reasons.includes(spike.reason)) continue;
        const signalKey = `${rule.id}:reason-spike:${spike.reason}:${new Date().toISOString().slice(0, 7)}`;
        if (!claimExecution(signalKey)) continue;
        const snapshot = await getTasksSnapshot();
        if (rule.actions.includes('create_task')) await createTask({ title: `Разобрать рост негатива: ${spike.reason}`, type: 'Аналитика', priority: rule.priority, status: 'new', dueDate: new Date(Date.now() + 2 * DAY).toLocaleDateString('ru-RU'), description: `Причина «${spike.reason}» выросла на ${spike.delta}% и встретилась ${spike.count} раз за текущий период.`, comments: [], checklist: [{ id: `root-${Date.now()}`, text: 'Проверить отзывы и определить первопричину', done: false }], attachments: [], automationRuleId: rule.id }, snapshot);
        if (rule.actions.includes('notify')) pushLocalNotification({ type: 'reviews', title: `Рост негатива: ${spike.reason}`, text: `+${spike.delta}% к прошлому периоду. Бизнес Щит рекомендует разобрать первопричину.`, tone: 'amber', actionLabel: 'Открыть аналитику', actionRoute: '/reputation' });
        appendLog({ ruleId: rule.id, ruleName: rule.name, trigger: rule.trigger, targetId: spike.reason, targetLabel: `Причина: ${spike.reason}`, status: 'success', effects: rule.actions });
      }
    }
  }
  await Promise.allSettled(executions);
  return { reason, evaluated: reviews.length, executions: executions.length };
}

const DAY = 24 * 60 * 60 * 1000;
