import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPreferences,
  saveNotificationSettings,
} from '../../../services/notifications/notificationService';

export default function useNotifications() {
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef(null);

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({ markAll: false, settings: false, itemId: null });
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => () => {
    mountedRef.current = false;
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = useCallback((message, tone = 'success') => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice({ id: Date.now(), message, tone });
    noticeTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getNotificationsSnapshot();
      if (mountedRef.current) setSnapshot(data);
    } catch {
      if (mountedRef.current) setError('Не удалось загрузить уведомления.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTab = snapshot?.preferences?.activeTab || 'unread';
  const activeType = snapshot?.preferences?.activeType || 'all';
  const unreadCount = useMemo(
    () => (snapshot?.notifications || []).filter((item) => item.unread).length,
    [snapshot],
  );

  const setPreference = useCallback(async (patch) => {
    if (!snapshot) return;
    const previous = snapshot;
    const optimistic = {
      ...snapshot,
      preferences: { ...(snapshot.preferences || {}), ...patch },
    };
    setSnapshot(optimistic);
    try {
      const result = await saveNotificationPreferences(patch, optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
    } catch {
      if (mountedRef.current) setSnapshot(previous);
      showNotice('Не удалось сохранить отображение', 'error');
    }
  }, [showNotice, snapshot]);

  const setActiveTab = useCallback((tab) => setPreference({ activeTab: tab }), [setPreference]);
  const setActiveType = useCallback((type) => setPreference({ activeType: type }), [setPreference]);

  const filteredNotifications = useMemo(() => {
    if (!snapshot) return [];
    const normalized = query.trim().toLowerCase();

    return [...snapshot.notifications]
      .filter((item) => {
        const tabMatch = activeTab === 'all' || (activeTab === 'unread' && item.unread);
        const typeMatch = activeType === 'all' || item.type === activeType;
        const queryMatch = !normalized || [item.title, item.text]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalized));
        return tabMatch && typeMatch && queryMatch;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [activeTab, activeType, query, snapshot]);

  const markRead = useCallback(async (notificationId) => {
    if (!snapshot) return;
    const current = snapshot.notifications.find((item) => item.id === notificationId);
    if (!current?.unread || busy.itemId) return;

    const previous = snapshot;
    const optimistic = {
      ...snapshot,
      notifications: snapshot.notifications.map((item) => (
        item.id === notificationId ? { ...item, unread: false } : item
      )),
    };
    setSnapshot(optimistic);
    setBusy((value) => ({ ...value, itemId: notificationId }));

    try {
      const result = await markNotificationRead(notificationId, optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
    } catch {
      if (mountedRef.current) setSnapshot(previous);
      showNotice('Не удалось отметить уведомление прочитанным', 'error');
    } finally {
      if (mountedRef.current) setBusy((value) => ({ ...value, itemId: null }));
    }
  }, [busy.itemId, showNotice, snapshot]);

  const markAllRead = useCallback(async () => {
    if (!snapshot || !unreadCount || busy.markAll) return;
    const previous = snapshot;
    const optimistic = {
      ...snapshot,
      notifications: snapshot.notifications.map((item) => ({ ...item, unread: false })),
    };
    setSnapshot(optimistic);
    setBusy((value) => ({ ...value, markAll: true }));

    try {
      const result = await markAllNotificationsRead(optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
      showNotice('Все уведомления прочитаны');
    } catch {
      if (mountedRef.current) setSnapshot(previous);
      showNotice('Не удалось обновить уведомления', 'error');
    } finally {
      if (mountedRef.current) setBusy((value) => ({ ...value, markAll: false }));
    }
  }, [busy.markAll, showNotice, snapshot, unreadCount]);

  const updateSettings = useCallback(async (patch, successMessage = 'Настройки сохранены') => {
    if (!snapshot || busy.settings) return;
    const previous = snapshot;
    const optimistic = {
      ...snapshot,
      settings: {
        ...snapshot.settings,
        ...patch,
        channels: { ...snapshot.settings.channels, ...(patch.channels || {}) },
        events: { ...snapshot.settings.events, ...(patch.events || {}) },
        quietHours: { ...snapshot.settings.quietHours, ...(patch.quietHours || {}) },
      },
    };
    setSnapshot(optimistic);
    setBusy((value) => ({ ...value, settings: true }));

    try {
      const result = await saveNotificationSettings(patch, optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
      if (successMessage) showNotice(successMessage);
    } catch {
      if (mountedRef.current) setSnapshot(previous);
      showNotice('Не удалось сохранить настройки', 'error');
    } finally {
      if (mountedRef.current) setBusy((value) => ({ ...value, settings: false }));
    }
  }, [busy.settings, showNotice, snapshot]);

  const toggleChannel = useCallback((id) => {
    if (!snapshot) return;
    updateSettings({ channels: { [id]: !snapshot.settings.channels[id] } }, 'Канал уведомлений обновлён');
  }, [snapshot, updateSettings]);

  const toggleEvent = useCallback((id) => {
    if (!snapshot) return;
    updateSettings({ events: { [id]: !snapshot.settings.events[id] } }, 'Событие обновлено');
  }, [snapshot, updateSettings]);

  const updateQuietHours = useCallback((patch) => {
    updateSettings({ quietHours: patch }, 'Тихие часы обновлены');
  }, [updateSettings]);

  return {
    snapshot,
    loading,
    error,
    reload: load,
    notice,
    busy,
    query,
    setQuery,
    activeTab,
    setActiveTab,
    activeType,
    setActiveType,
    unreadCount,
    filteredNotifications,
    markRead,
    markAllRead,
    updateSettings,
    toggleChannel,
    toggleEvent,
    updateQuietHours,
  };
}
