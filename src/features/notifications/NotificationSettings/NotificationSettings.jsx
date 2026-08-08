import React, { memo } from 'react';
import { CHANNELS, EVENTS } from '../model/notificationData';
import { ClockIcon, ICON_MAP } from '../model/icons';
import './NotificationSettings.scss';

function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      className={`notification-switch ${checked ? 'is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function NotificationSettings({ settings, busy, onToggleChannel, onToggleEvent, onUpdateQuietHours }) {
  return (
    <div className="notification-settings">
      <section className="notification-settings__panel">
        <div className="notification-settings__heading">
          <div>
            <span>ДОСТАВКА</span>
            <h2>Каналы уведомлений</h2>
          </div>
          <p>Выберите, куда отправлять важные события.</p>
        </div>

        <div className="notification-settings__list">
          {CHANNELS.map((channel, index) => (
            <div className="notification-setting-row" key={channel.id} style={{ '--setting-delay': `${index * 42}ms` }}>
              <div className={`notification-setting-row__icon notification-setting-row__icon--${channel.id}`}>
                <span>{channel.label.slice(0, 1)}</span>
              </div>
              <div className="notification-setting-row__copy">
                <strong>{channel.label}</strong>
                <span>{channel.description}</span>
              </div>
              <Toggle
                checked={Boolean(settings.channels[channel.id])}
                disabled={busy}
                label={`${channel.label}: ${settings.channels[channel.id] ? 'включено' : 'выключено'}`}
                onChange={() => onToggleChannel(channel.id)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="notification-settings__panel">
        <div className="notification-settings__heading">
          <div>
            <span>СОБЫТИЯ</span>
            <h2>Что считать важным</h2>
          </div>
          <p>Отключите события, которые не требуют вашего внимания.</p>
        </div>

        <div className="notification-settings__list">
          {EVENTS.map((event, index) => {
            const Icon = ICON_MAP[event.icon] || ICON_MAP.system;
            return (
              <div className="notification-setting-row" key={event.id} style={{ '--setting-delay': `${index * 36}ms` }}>
                <div className={`notification-setting-row__icon notification-setting-row__icon--${event.tone}`}><Icon /></div>
                <div className="notification-setting-row__copy"><strong>{event.label}</strong></div>
                <Toggle
                  checked={Boolean(settings.events[event.id])}
                  disabled={busy}
                  label={`${event.label}: ${settings.events[event.id] ? 'включено' : 'выключено'}`}
                  onChange={() => onToggleEvent(event.id)}
                />
              </div>
            );
          })}
        </div>

        <div className="notification-quiet-hours">
          <div className="notification-quiet-hours__title">
            <span className="notification-quiet-hours__icon"><ClockIcon /></span>
            <div>
              <strong>Тихие часы</strong>
              <span>В этот период уведомления не отправляются.</span>
            </div>
            <Toggle
              checked={Boolean(settings.quietHours.enabled)}
              disabled={busy}
              label="Тихие часы"
              onChange={() => onUpdateQuietHours({ enabled: !settings.quietHours.enabled })}
            />
          </div>

          <div className={`notification-quiet-hours__time ${settings.quietHours.enabled ? '' : 'is-disabled'}`}>
            <label>
              <span>С</span>
              <input
                type="time"
                value={settings.quietHours.from}
                disabled={!settings.quietHours.enabled || busy}
                onChange={(event) => onUpdateQuietHours({ from: event.target.value })}
              />
            </label>
            <span className="notification-quiet-hours__dash">—</span>
            <label>
              <span>До</span>
              <input
                type="time"
                value={settings.quietHours.to}
                disabled={!settings.quietHours.enabled || busy}
                onChange={(event) => onUpdateQuietHours({ to: event.target.value })}
              />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}

export default memo(NotificationSettings);
