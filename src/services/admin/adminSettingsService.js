import {
  DEFAULT_INTEGRATIONS,
  DEFAULT_NOTIFICATION_TRIGGERS,
  DEFAULT_REPLY_TEMPLATES,
  DEFAULT_SECURITY_LOG,
  DEFAULT_SECURITY_SETTINGS,
  DEFAULT_SMTP_SETTINGS,
} from '../../features/admin/settings/model/adminSettingsData';
import { getAdminSubscriptions, updateAdminPlan } from './adminSubscriptionsService';

const CACHE_KEY = 'business-shield:admin-settings:v2';
const endpoint = process.env.REACT_APP_ADMIN_SETTINGS_ENDPOINT || '';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function defaultSnapshot() {
  return {
    notifications: clone(DEFAULT_NOTIFICATION_TRIGGERS),
    smtp: clone(DEFAULT_SMTP_SETTINGS),
    integrations: clone(DEFAULT_INTEGRATIONS),
    templates: clone(DEFAULT_REPLY_TEMPLATES),
    security: clone(DEFAULT_SECURITY_SETTINGS),
    securityLog: clone(DEFAULT_SECURITY_LOG),
  };
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? { ...defaultSnapshot(), ...parsed } : defaultSnapshot();
  } catch { return defaultSnapshot(); }
}

function writeCache(snapshot) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

async function request(path = '', options) {
  const response = await fetch(`${endpoint}${path}`, {
    credentials:'include',
    headers:{ 'Content-Type':'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`Admin settings API: ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

export async function getAdminSettings() {
  if (endpoint) {
    const data = await request();
    if (!data) throw new Error('Некорректный ответ API настроек');
    return { ...data, source:'api' };
  }
  const billing = await getAdminSubscriptions();
  return { ...readCache(), plans:billing.plans, source:'cache' };
}

export async function saveAdminSettingsSection(section, value) {
  if (endpoint) return request(`/${section}`, { method:'PATCH', body:JSON.stringify(value) });
  const snapshot = readCache();
  snapshot[section] = value;
  writeCache(snapshot);
  return value;
}

export async function saveAdminPlanFromSettings(planId, patch) {
  return updateAdminPlan(planId, patch);
}

export async function toggleAdminIntegration(integrationId) {
  if (endpoint) return request(`/integrations/${integrationId}/toggle`, { method:'POST' });
  const snapshot = readCache();
  snapshot.integrations = snapshot.integrations.map((item) => item.id === integrationId ? { ...item, status:item.status === 'connected' ? 'disconnected' : 'connected' } : item);
  writeCache(snapshot);
  return snapshot.integrations.find((item) => item.id === integrationId);
}

export async function saveAdminTemplate(template) {
  if (endpoint) {
    return request(`/templates${template.id ? `/${template.id}` : ''}`, { method:template.id ? 'PATCH':'POST', body:JSON.stringify(template) });
  }
  const snapshot = readCache();
  const id = template.id || `template-${Date.now()}`;
  const next = { ...template, id };
  const exists = snapshot.templates.some((item) => item.id === id);
  snapshot.templates = exists ? snapshot.templates.map((item) => item.id === id ? next : item) : [next, ...snapshot.templates];
  writeCache(snapshot);
  return next;
}

export async function deleteAdminTemplate(templateId) {
  if (endpoint) return request(`/templates/${templateId}`, { method:'DELETE' });
  const snapshot = readCache();
  snapshot.templates = snapshot.templates.filter((item) => item.id !== templateId);
  writeCache(snapshot);
  return true;
}

export async function testAdminSmtp(smtp) {
  if (endpoint) return request('/smtp/test', { method:'POST', body:JSON.stringify(smtp) });
  await new Promise((resolve) => setTimeout(resolve, 550));
  if (!smtp.host || !smtp.email) throw new Error('Заполните SMTP хост и email');
  return { ok:true, message:'Соединение установлено' };
}

export function resetAdminSettingsCache() { localStorage.removeItem(CACHE_KEY); }
