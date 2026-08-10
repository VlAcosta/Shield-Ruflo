import { getRuntimeEnv } from '../core/runtimeEnv';
import { DEFAULT_NOTIFICATIONS_SNAPSHOT } from '../../features/notifications/model/notificationData';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getAccountScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const NOTIFICATIONS_ENDPOINT = String(getRuntimeEnv('NOTIFICATIONS_ENDPOINT', '/api/v1/notifications')).replace(/\/$/, '');
const CACHE_KEY = 'business-shield:notifications:snapshot:v2';
export const NOTIFICATION_BADGE_EVENT = 'business-shield:notifications-badge';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptySnapshot() {
  if (isDemoDataEnabled()) return clone(DEFAULT_NOTIFICATIONS_SNAPSHOT);
  return { notifications: [], preferences: {}, settings: {}, source: 'api' };
}

function readCache() {
  return readScopedJson(CACHE_KEY, { scope: getAccountScope(), legacy: true, fallback: null });
}

function normalizeNotification(item = {}) {
  return {
    ...item,
    text: item.text ?? item.body ?? '',
    unread: item.unread ?? String(item.status || '').toUpperCase() === 'UNREAD',
    createdAt: item.createdAt || Date.now(),
    actionLabel: item.actionLabel || item.payload?.actionLabel || '',
    actionRoute: item.actionRoute || item.payload?.actionRoute || '',
    tone: item.tone || item.payload?.tone || 'violet',
  };
}

function normalizeSnapshot(payload) {
  const source = payload?.snapshot || payload || {};
  const notifications = Array.isArray(source.notifications)
    ? source.notifications.map(normalizeNotification)
    : [];
  return {
    ...source,
    notifications,
    preferences: source.preferences || {},
    settings: source.settings || {},
  };
}

function writeCache(snapshot) {
  if (typeof window === 'undefined') return;
  const previousUnread = getUnreadCount(readCache() || createEmptySnapshot());
  const nextUnread = getUnreadCount(snapshot);
  writeScopedJson(CACHE_KEY, snapshot, { scope: getAccountScope() });
  if (previousUnread !== nextUnread) emitNotificationBadge(snapshot);
}

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(NOTIFICATIONS_ENDPOINT, path), { ...options, timeout: 8000 });
}

export function getUnreadCount(snapshot) {
  return (snapshot?.notifications || []).reduce((count, item) => count + (item.unread ? 1 : 0), 0);
}

export function getCachedUnreadCount() {
  return getUnreadCount(readCache() || createEmptySnapshot());
}

export function emitNotificationBadge(snapshot) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_BADGE_EVENT, {
    detail: { unreadCount: getUnreadCount(snapshot) },
  }));
}

export async function getNotificationsSnapshot() {
  try {
    const remote = normalizeSnapshot(await request());
    writeCache(remote);
    return remote;
  } catch (error) {
    const cached = readCache();
    if (cached) return { ...cached, stale: true, error };
    if (isDemoDataEnabled()) return createEmptySnapshot();
    throw error;
  }
}

// Kept only for explicit local/demo UX signals. Persisted production
// notifications are created by backend automation/business events.
export function pushLocalNotification(payload = {}) {
  const snapshot = readCache() || createEmptySnapshot();
  const notification = normalizeNotification({
    id: payload.id || `local-notification-${Date.now().toString(36)}`,
    type: payload.type || 'system',
    title: payload.title || 'Новое событие',
    body: payload.text || '',
    createdAt: payload.createdAt || new Date().toISOString(),
    status: 'UNREAD',
    tone: payload.tone || 'violet',
    actionLabel: payload.actionLabel || '',
    actionRoute: payload.actionRoute || '',
    localOnly: true,
  });
  const next = { ...snapshot, notifications: [notification, ...(snapshot.notifications || [])].slice(0, 120) };
  writeCache(next);
  return notification;
}

export async function markNotificationRead(notificationId, snapshot) {
  const remote = await request(`/${notificationId}/read`, { method: 'PATCH' });
  const updated = normalizeNotification(remote?.notification || remote);
  const nextSnapshot = {
    ...snapshot,
    notifications: (snapshot?.notifications || []).map((item) => item.id === notificationId ? updated : item),
  };
  writeCache(nextSnapshot);
  return { ...remote, snapshot: nextSnapshot };
}

export async function markAllNotificationsRead(snapshot) {
  await request('/read-all', { method: 'PATCH' });
  const nextSnapshot = {
    ...snapshot,
    notifications: (snapshot?.notifications || []).map((item) => ({ ...item, unread: false, status: 'READ' })),
  };
  writeCache(nextSnapshot);
  return { snapshot: nextSnapshot };
}

export async function saveNotificationPreferences(preferences, snapshot) {
  const remote = await request('/preferences', { method: 'PATCH', body: preferences });
  const nextSnapshot = { ...snapshot, preferences: remote?.preferences || preferences };
  writeCache(nextSnapshot);
  return { ...remote, snapshot: nextSnapshot };
}

export async function saveNotificationSettings(settings, snapshot) {
  const remote = await request('/settings', { method: 'PATCH', body: settings });
  const nextSnapshot = { ...snapshot, settings: remote?.settings || settings };
  writeCache(nextSnapshot);
  return { ...remote, snapshot: nextSnapshot };
}
