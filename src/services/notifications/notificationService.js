import { getRuntimeEnv } from '../core/runtimeEnv';
import { DEFAULT_NOTIFICATIONS_SNAPSHOT } from '../../features/notifications/model/notificationData';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getAccountScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const NOTIFICATIONS_ENDPOINT = getRuntimeEnv('NOTIFICATIONS_ENDPOINT');
const CACHE_KEY = 'business-shield:notifications:snapshot:v1';
export const NOTIFICATION_BADGE_EVENT = 'business-shield:notifications-badge';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLocalFallback() {
  const base = clone(DEFAULT_NOTIFICATIONS_SNAPSHOT);
  if (isDemoDataEnabled()) return base;
  return { ...base, notifications: [] };
}

function readCache() {
  return readScopedJson(CACHE_KEY, { scope: getAccountScope(), legacy: true, fallback: null });
}

function writeCache(snapshot) {
  if (typeof window === 'undefined') return;
  const previousUnread = getUnreadCount(readCache() || createLocalFallback());
  const nextUnread = getUnreadCount(snapshot);
  writeScopedJson(CACHE_KEY, snapshot, { scope: getAccountScope() });

  // Badge listeners only need a signal when the counter actually changed.
  // This avoids feedback loops when a popover reads the same snapshot again.
  if (previousUnread !== nextUnread) emitNotificationBadge(snapshot);
}

async function request(path = '', options = {}) {
  if (!NOTIFICATIONS_ENDPOINT) return null;
  return apiRequest(joinEndpoint(NOTIFICATIONS_ENDPOINT, path), { ...options, timeout: 8000 });
}

export function getUnreadCount(snapshot) {
  return (snapshot?.notifications || []).reduce((count, item) => count + (item.unread ? 1 : 0), 0);
}

export function getCachedUnreadCount() {
  return getUnreadCount(readCache() || createLocalFallback());
}

export function emitNotificationBadge(snapshot) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_BADGE_EVENT, {
    detail: { unreadCount: getUnreadCount(snapshot) },
  }));
}

export async function getNotificationsSnapshot() {
  let remote = null;
  try { remote = await request(); } catch (error) {
    const cached = readCache();
    if (!cached) throw error;
  }
  const snapshot = remote || readCache() || createLocalFallback();
  writeCache(snapshot);
  return snapshot;
}


export function pushLocalNotification(payload = {}) {
  const snapshot = readCache() || createLocalFallback();
  const notification = {
    id: payload.id || `notification-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: payload.type || 'system',
    title: payload.title || 'Новое событие',
    text: payload.text || '',
    createdAt: payload.createdAt || Date.now(),
    unread: payload.unread !== false,
    tone: payload.tone || 'violet',
    actionLabel: payload.actionLabel || '',
    actionRoute: payload.actionRoute || '',
  };
  const next = { ...snapshot, notifications: [notification, ...(snapshot.notifications || [])].slice(0, 120) };
  writeCache(next);
  return notification;
}

export async function markNotificationRead(notificationId, snapshot) {
  const remote = await request(`/${notificationId}/read`, { method: 'PATCH' });
  if (remote) {
    writeCache(remote.snapshot || remote);
    return remote;
  }

  const nextSnapshot = {
    ...snapshot,
    notifications: snapshot.notifications.map((item) => (
      item.id === notificationId ? { ...item, unread: false } : item
    )),
  };
  writeCache(nextSnapshot);
  return { snapshot: nextSnapshot };
}

export async function markAllNotificationsRead(snapshot) {
  const remote = await request('/read-all', { method: 'PATCH' });
  if (remote) {
    writeCache(remote.snapshot || remote);
    return remote;
  }

  const nextSnapshot = {
    ...snapshot,
    notifications: snapshot.notifications.map((item) => ({ ...item, unread: false })),
  };
  writeCache(nextSnapshot);
  return { snapshot: nextSnapshot };
}

export async function saveNotificationPreferences(preferences, snapshot) {
  const remote = await request('/preferences', {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  });
  if (remote) {
    writeCache(remote.snapshot || remote);
    return remote;
  }

  const nextSnapshot = {
    ...snapshot,
    preferences: { ...(snapshot.preferences || {}), ...preferences },
  };
  writeCache(nextSnapshot);
  return { snapshot: nextSnapshot };
}

export async function saveNotificationSettings(settings, snapshot) {
  const remote = await request('/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
  if (remote) {
    writeCache(remote.snapshot || remote);
    return remote;
  }

  const nextSnapshot = {
    ...snapshot,
    settings: {
      ...snapshot.settings,
      ...settings,
      channels: { ...snapshot.settings.channels, ...(settings.channels || {}) },
      events: { ...snapshot.settings.events, ...(settings.events || {}) },
      quietHours: { ...snapshot.settings.quietHours, ...(settings.quietHours || {}) },
    },
  };
  writeCache(nextSnapshot);
  return { snapshot: nextSnapshot };
}
