import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
export const COMPANY_ACTIVITY_KEY = 'business-shield:company-activity:v1';
export const COMPANY_PRESENCE_KEY = 'business-shield:company-presence:v1';
export const COMPANY_ACTIVITY_CHANGED_EVENT = 'business-shield:company-activity-changed';
export const COMPANY_PRESENCE_CHANGED_EVENT = 'business-shield:company-presence-changed';

const MAX_ACTIVITY = 120;
const ONLINE_WINDOW_MS = 95 * 1000;

const clone = (value) => JSON.parse(JSON.stringify(value));

function readJson(key, fallback) {
  return readScopedJson(key, { scope: getCompanyScope(), legacy: true, fallback });
}

function writeJson(key, value, eventName) {
  if (typeof window === 'undefined') return;
  writeScopedJson(key, value, { scope: getCompanyScope() });
  window.dispatchEvent(new CustomEvent(eventName, { detail: clone(value) }));
}

export function readCompanyActivity() {
  const value = readJson(COMPANY_ACTIVITY_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function readCompanyPresence() {
  const value = readJson(COMPANY_PRESENCE_KEY, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readCurrentIdentity() {
  if (typeof window === 'undefined') return null;
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const membership = user?.membership || JSON.parse(localStorage.getItem('business-shield:company-membership:v1') || 'null');
    if (!user && !membership) return null;
    const email = String(user?.email || membership?.email || '').trim().toLowerCase();
    const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.name || email || 'Пользователь';
    return {
      id: user?.id || membership?.userId || email || 'current-user',
      email,
      name,
      role: membership?.accessRoleId || membership?.role || user?.role || 'owner',
    };
  } catch {
    return null;
  }
}

export function recordCompanyActivity(payload = {}) {
  const identity = payload.actor || readCurrentIdentity();
  if (!identity) return null;
  const current = readCompanyActivity();
  const now = new Date().toISOString();
  const event = {
    id: payload.id || `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: payload.type || 'activity',
    title: payload.title || 'Действие в кабинете',
    detail: payload.detail || '',
    route: payload.route || '',
    targetId: payload.targetId || '',
    actor: identity,
    createdAt: payload.createdAt || now,
    tone: payload.tone || 'neutral',
  };

  const duplicate = current[0]
    && current[0].type === event.type
    && current[0].title === event.title
    && current[0].actor?.email === event.actor?.email
    && Date.now() - new Date(current[0].createdAt).getTime() < 45000;
  if (duplicate) return current[0];

  const next = [event, ...current].slice(0, MAX_ACTIVITY);
  writeJson(COMPANY_ACTIVITY_KEY, next, COMPANY_ACTIVITY_CHANGED_EVENT);
  return clone(event);
}

export function touchCurrentPresence(extra = {}) {
  const identity = readCurrentIdentity();
  if (!identity) return null;
  const key = identity.email || identity.id;
  const current = readCompanyPresence();
  const now = new Date().toISOString();
  const nextItem = {
    ...(current[key] || {}),
    ...identity,
    ...extra,
    lastSeenAt: now,
    lastLoginAt: current[key]?.lastLoginAt || extra.lastLoginAt || now,
  };
  const next = { ...current, [key]: nextItem };
  writeJson(COMPANY_PRESENCE_KEY, next, COMPANY_PRESENCE_CHANGED_EVENT);
  return clone(nextItem);
}

export function markCurrentLogin(extra = {}) {
  const identity = readCurrentIdentity();
  if (!identity) return null;
  const key = identity.email || identity.id;
  const current = readCompanyPresence();
  const now = new Date().toISOString();
  const item = {
    ...(current[key] || {}),
    ...identity,
    ...extra,
    lastSeenAt: now,
    lastLoginAt: now,
  };
  writeJson(COMPANY_PRESENCE_KEY, { ...current, [key]: item }, COMPANY_PRESENCE_CHANGED_EVENT);
  recordCompanyActivity({ type: 'login', title: 'Вошёл в кабинет', detail: extra.device || '', tone: 'success', actor: identity });
  return clone(item);
}

export function enrichMemberPresence(user = {}, presenceMap = readCompanyPresence()) {
  const key = String(user.email || user.id || '').trim().toLowerCase();
  const presence = presenceMap[key] || presenceMap[user.id] || {};
  const lastSeenMs = new Date(presence.lastSeenAt || 0).getTime();
  return {
    ...user,
    presence,
    online: Boolean(lastSeenMs && Date.now() - lastSeenMs <= ONLINE_WINDOW_MS),
    lastSeenAt: presence.lastSeenAt || user.lastSeenAt || user.lastLoginAt || '',
    lastLoginAt: presence.lastLoginAt || user.lastLoginAt || '',
  };
}

export function activityForMember(user = {}, activity = readCompanyActivity()) {
  const email = String(user.email || '').trim().toLowerCase();
  return activity.filter((item) => {
    const actorEmail = String(item.actor?.email || '').trim().toLowerCase();
    return (email && actorEmail === email) || item.actor?.id === user.id;
  });
}
