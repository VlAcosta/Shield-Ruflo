import React, { memo } from 'react';
import { CHANNELS, EVENTS } from '../model/notificationData';
import { ClockIcon, ICON_MAP } from '../model/icons';
import './NotificationSettings.scss';
import './NotificationCapabilities.scss';

const DELIVERY_CHANNELS = Object.freeze([
  {
    id: 'in-app',
    label: 'В кабинете',
    description: 'Центр уведомлений и счётчик в верхней панели.',
    available: true,
  },
  ...CHANNELS.map((channel) => ({ ...channel, available: false })),
]);

function CapabilityStatus({ available }) {
  return (
    <span className={`notification-capability ${available ? 'is-active' : 'is-planned'}`}>
      <i /> {available ? 'Работает' : 'Не подключено'}
    </span>
  );
}

function NotificationSettings() {
  return (
    <div className="notification-settings">
      <section className="notification-settings__panel">
        <div className="notification-settings__heading">
          <div>
            <span>ДОСТАВКА</span>
            <h2>Каналы уведомлений</h2>
          </div>
          <p>Показываем только фактически подключённые способы доставки.</p>
        </div>

        <div className="notification-settings__list">
          {DELIVERY_CHANNELS.map((channel, index) => (
            <div className="notification-setting-row" key={channel.id} style={{ '--setting-delay': `${index * 42}ms` }}>
              <div className={`notification-setting-row__icon notification-setting-row__icon--${channel.id}`}>
                <span>{channel.label.slice(0, 1)}</span>
              </div>
              <div className="notification-setting-row__copy">
                <strong>{channel.label}</strong>
                <span>{channel.description}</span>
              </div>
              <CapabilityStatus available={channel.available} />
            </div>
          ))}
        </div>

        <div className="notification-capability-note">
          Email, Telegram, Push и SMS появятся здесь только после подключения реальной очереди доставки и provider credentials.
        </div>
      </section>

      <section className="notification-settings__panel">
        <div className="notification-settings__heading">
          <div>
            <span>СОБЫТИЯ</span>
            <h2>События в кабинете</h2>
          </div>
          <p>Эти категории отображаются в центре уведомлений по мере появления событий.</p>
        </div>

        <div className="notification-settings__list">
          {EVENTS.map((event, index) => {
            const Icon = ICON_MAP[event.icon] || ICON_MAP.system;
            return (
              <div className="notification-setting-row" key={event.id} style={{ '--setting-delay': `${index * 36}ms` }}>
                <div className={`notification-setting-row__icon notification-setting-row__icon--${event.tone}`}><Icon /></div>
                <div className="notification-setting-row__copy">
                  <strong>{event.label}</strong>
                  <span>Отображается в центре уведомлений, когда backend создаёт такое событие.</span>
                </div>
                <span className="notification-capability is-active"><i /> В кабинете</span>
              </div>
            );
          })}
        </div>

        <div className="notification-quiet-hours notification-quiet-hours--planned">
          <div className="notification-quiet-hours__title">
            <span className="notification-quiet-hours__icon"><ClockIcon /></span>
            <div>
              <strong>Тихие часы</strong>
              <span>Станут доступны вместе с внешними каналами доставки. Сейчас уведомления только сохраняются в кабинете.</span>
            </div>
            <span className="notification-capability is-planned"><i /> Не подключено</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default memo(NotificationSettings);
