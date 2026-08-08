import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  formatNotificationTime,
  NOTIFICATION_TYPES,
  TYPE_META,
} from '../model/notificationData';
import {
  CheckAllIcon,
  ChevronIcon,
  ICON_MAP,
  SearchIcon,
} from '../model/icons';
import './NotificationFeed.scss';

function NotificationFeed({
  items,
  query,
  onQueryChange,
  activeType,
  onTypeChange,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  markAllBusy,
}) {
  const navigate = useNavigate();

  const openItem = (item) => {
    if (item.unread) onMarkRead(item.id);
    if (item.actionRoute) navigate(item.actionRoute);
  };

  return (
    <div className="notification-feed">
      <div className="notification-feed__toolbar">
        <label className="notification-feed__search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Поиск по уведомлениям"
            aria-label="Поиск по уведомлениям"
          />
        </label>

        <button
          type="button"
          className="notification-feed__read-all"
          disabled={!unreadCount || markAllBusy}
          onClick={onMarkAllRead}
        >
          <CheckAllIcon />
          <span>{markAllBusy ? 'Обновляем…' : 'Прочитать все'}</span>
        </button>
      </div>

      <div className="notification-feed__types" aria-label="Фильтр уведомлений">
        {NOTIFICATION_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className={activeType === type.id ? 'is-active' : ''}
            onClick={() => onTypeChange(type.id)}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="notification-feed__list">
        {items.length ? items.map((item, index) => {
          const meta = TYPE_META[item.type] || TYPE_META.system;
          const Icon = ICON_MAP[meta.icon] || ICON_MAP.system;

          return (
            <article
              className={`notification-card notification-card--${item.tone || 'blue'} ${item.unread ? 'is-unread' : ''}`}
              key={item.id}
              style={{ '--notification-delay': `${Math.min(index, 8) * 36}ms` }}
            >
              <button
                type="button"
                className="notification-card__main"
                onClick={() => openItem(item)}
                aria-label={`${item.title}. ${item.text}`}
              >
                <span className="notification-card__icon"><Icon /></span>
                <span className="notification-card__content">
                  <span className="notification-card__eyebrow">
                    <span>{meta.label}</span>
                    <span>•</span>
                    <time>{formatNotificationTime(item.createdAt)}</time>
                  </span>
                  <strong className="notification-card__title">
                    {item.title}
                    {item.unread ? <i aria-label="Непрочитано" /> : null}
                  </strong>
                  <span className="notification-card__text">{item.text}</span>
                </span>
                {item.actionRoute ? <span className="notification-card__chevron"><ChevronIcon /></span> : null}
              </button>

              {item.unread ? (
                <button type="button" className="notification-card__read" onClick={() => onMarkRead(item.id)}>
                  Отметить прочитанным
                </button>
              ) : null}
            </article>
          );
        }) : (
          <section className="notification-feed__empty">
            <span className="notification-feed__empty-icon"><CheckAllIcon /></span>
            <h3>Здесь всё спокойно</h3>
            <p>По выбранным фильтрам уведомлений нет. Когда появится что-то важное, мы покажем это здесь.</p>
          </section>
        )}
      </div>
    </div>
  );
}

export default memo(NotificationFeed);
