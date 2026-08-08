import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getNotificationsSnapshot,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../../services/notifications/notificationService';
import { formatNotificationTime } from '../../../features/notifications/model/notificationData';
import { BellIcon, CircleCheckIcon } from '../icons';

const TONE_ICON = Object.freeze({
  amber: '★',
  violet: '✓',
  purple: '▥',
  green: '↗',
  red: '!',
  blue: 'i',
});

function PortalNotificationsMenu({ open, onClose }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const mountedRef = useRef(true);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotificationsSnapshot();
      if (mountedRef.current) setSnapshot(data);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) onClose();
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose, open]);

  if (!open) return null;

  const notifications = [...(snapshot?.notifications || [])]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  const unreadCount = (snapshot?.notifications || []).filter((item) => item.unread).length;

  const openNotification = async (item) => {
    if (item.unread && snapshot) {
      const optimistic = {
        ...snapshot,
        notifications: snapshot.notifications.map((value) => (
          value.id === item.id ? { ...value, unread: false } : value
        )),
      };
      setSnapshot(optimistic);
      await markNotificationRead(item.id, optimistic).catch(() => null);
    }

    onClose();
    if (item.actionRoute) navigate(item.actionRoute);
    else navigate('/notifications');
  };

  const markAll = async () => {
    if (!snapshot || !unreadCount || busy) return;
    setBusy(true);
    const optimistic = {
      ...snapshot,
      notifications: snapshot.notifications.map((item) => ({ ...item, unread: false })),
    };
    setSnapshot(optimistic);
    try {
      const result = await markAllNotificationsRead(optimistic);
      if (result?.snapshot) setSnapshot(result.snapshot);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="portal-popover portal-popover--notifications">
      <header className="portal-popover__head">
        <div>
          <span className="portal-popover__eyebrow">Центр событий</span>
          <h3>Уведомления</h3>
        </div>
        {unreadCount ? <span className="portal-popover__count">{unreadCount} новых</span> : null}
      </header>

      <div className="portal-popover__actions">
        <button type="button" onClick={markAll} disabled={!unreadCount || busy}>
          <CircleCheckIcon />
          <span>{busy ? 'Сохраняем...' : 'Прочитать все'}</span>
        </button>
      </div>

      <div className="portal-notifications-mini">
        {loading && !snapshot ? (
          Array.from({ length: 4 }).map((_, index) => (
            <span className="portal-notifications-mini__skeleton" key={index} />
          ))
        ) : notifications.length ? notifications.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`portal-notifications-mini__item ${item.unread ? 'is-unread' : ''}`}
            onClick={() => openNotification(item)}
          >
            <span className={`portal-notifications-mini__icon is-${item.tone || 'blue'}`}>
              {TONE_ICON[item.tone] || '•'}
            </span>
            <span className="portal-notifications-mini__copy">
              <strong>{item.title}</strong>
              <small>{item.text}</small>
              <em>{formatNotificationTime(item.createdAt)}</em>
            </span>
            {item.unread ? <i aria-hidden="true" /> : null}
          </button>
        )) : (
          <div className="portal-popover__empty">
            <BellIcon />
            <strong>Всё спокойно</strong>
            <span>Новых уведомлений пока нет.</span>
          </div>
        )}
      </div>

      <footer className="portal-popover__footer">
        <button type="button" onClick={() => { onClose(); navigate('/notifications'); }}>
          Все уведомления
          <span>→</span>
        </button>
      </footer>
    </div>
  );
}

export default memo(PortalNotificationsMenu);
