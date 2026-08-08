import React from 'react';
import NotificationTabs from '../NotificationTabs';
import NotificationFeed from '../NotificationFeed';
import NotificationSettings from '../NotificationSettings';
import useNotifications from '../hooks/useNotifications';
import './NotificationsWorkspace.scss';

export default function NotificationsWorkspace() {
  const notifications = useNotifications();

  if (notifications.loading) {
    return (
      <div className="notifications-skeleton" aria-label="Загрузка уведомлений">
        <span className="notifications-skeleton__tabs" />
        <span className="notifications-skeleton__toolbar" />
        <div className="notifications-skeleton__list">
          {Array.from({ length: 4 }).map((_, index) => <span key={index} />)}
        </div>
      </div>
    );
  }

  if (notifications.error || !notifications.snapshot) {
    return (
      <section className="notifications-error">
        <span className="notifications-error__mark">!</span>
        <div>
          <h2>Уведомления временно недоступны</h2>
          <p>{notifications.error || 'Не удалось получить данные.'}</p>
        </div>
        <button type="button" onClick={notifications.reload}>Повторить</button>
      </section>
    );
  }

  return (
    <div className="notifications-workspace">
      <NotificationTabs
        value={notifications.activeTab}
        unreadCount={notifications.unreadCount}
        onChange={notifications.setActiveTab}
      />

      <div className="notifications-workspace__content" key={notifications.activeTab}>
        {notifications.activeTab === 'settings' ? (
          <NotificationSettings
            settings={notifications.snapshot.settings}
            busy={notifications.busy.settings}
            onToggleChannel={notifications.toggleChannel}
            onToggleEvent={notifications.toggleEvent}
            onUpdateQuietHours={notifications.updateQuietHours}
          />
        ) : (
          <NotificationFeed
            items={notifications.filteredNotifications}
            query={notifications.query}
            onQueryChange={notifications.setQuery}
            activeType={notifications.activeType}
            onTypeChange={notifications.setActiveType}
            unreadCount={notifications.unreadCount}
            onMarkRead={notifications.markRead}
            onMarkAllRead={notifications.markAllRead}
            markAllBusy={notifications.busy.markAll}
          />
        )}
      </div>

      {notifications.notice ? (
        <div
          className={`notifications-toast notifications-toast--${notifications.notice.tone}`}
          key={notifications.notice.id}
          role="status"
        >
          <span />
          {notifications.notice.message}
        </div>
      ) : null}
    </div>
  );
}
