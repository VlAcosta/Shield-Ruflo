import React, { memo } from 'react';
import { NOTIFICATION_TABS } from '../model/notificationData';
import { SettingsIcon } from '../model/icons';
import './NotificationTabs.scss';

function NotificationTabs({ value, unreadCount, onChange }) {
  return (
    <div className="notification-tabs" role="tablist" aria-label="Разделы уведомлений">
      {NOTIFICATION_TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`notification-tabs__item ${active ? 'is-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.id === 'settings' ? <SettingsIcon /> : null}
            <span>{tab.label}</span>
            {tab.id === 'unread' && unreadCount ? <em>{unreadCount}</em> : null}
          </button>
        );
      })}
    </div>
  );
}

export default memo(NotificationTabs);
