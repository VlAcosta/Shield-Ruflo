import React, { useMemo, useState } from 'react';
import { DesktopIcon, ExitIcon, EyeIcon, LockIcon, MobileIcon, ShieldIcon } from '../model/icons';
import './SecurityProfile.scss';

const onlyDigits = (value) => value.replace(/\D/g, '').slice(0, 4);

function PinField({ label, value, onChange, visible, onToggle, error = '' }) {
  return (
    <label className={`security-profile__pin-field ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      <div>
        <input
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={value}
          onChange={(event) => onChange(onlyDigits(event.target.value))}
          placeholder="••••"
        />
        <button type="button" onClick={onToggle} aria-label={visible ? 'Скрыть PIN' : 'Показать PIN'}>
          <EyeIcon />
        </button>
      </div>
      {error ? <small>{error}</small> : null}
    </label>
  );
}

export default function SecurityProfile({ sessions, preferences, busy, onChangePin, onSavePreferences, onRevokeSession, onRevokeOthers }) {
  const [pins, setPins] = useState({ current: '', next: '', repeat: '' });
  const [visible, setVisible] = useState({ current: false, next: false, repeat: false });
  const [errors, setErrors] = useState({});
  const [confirmAll, setConfirmAll] = useState(false);
  const [policy, setPolicy] = useState(preferences || { autoLock: true, sessionMinutes: 15 });

  React.useEffect(() => {
    setPolicy(preferences || { autoLock: true, sessionMinutes: 15 });
  }, [preferences]);

  const otherSessions = useMemo(() => sessions.filter((session) => !session.current), [sessions]);

  const setPin = (key, value) => {
    setPins((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const submitPin = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (pins.current.length !== 4) nextErrors.current = 'Введите текущий 4-значный PIN';
    if (pins.next.length !== 4) nextErrors.next = 'Новый PIN должен содержать 4 цифры';
    if (pins.repeat !== pins.next) nextErrors.repeat = 'PIN-коды не совпадают';
    if (pins.current && pins.current === pins.next) nextErrors.next = 'Новый PIN должен отличаться от текущего';

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const result = await onChangePin({ currentPin: pins.current, newPin: pins.next });
    if (result?.success) {
      setPins({ current: '', next: '', repeat: '' });
      setErrors({});
    } else if (result?.message) {
      setErrors({ current: result.message });
    }
  };

  const handleRevokeOthers = () => {
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
    onRevokeOthers();
  };

  return (
    <div className="security-profile">
      <form className="security-profile__pin-card" onSubmit={submitPin}>
        <header>
          <div className="security-profile__section-icon"><ShieldIcon /></div>
          <div>
            <span>Защита кабинета</span>
            <h2>Смена PIN-кода</h2>
            <p>PIN используется для локальной блокировки кабинета и повторного входа.</p>
          </div>
        </header>

        <div className="security-profile__pin-grid">
          <PinField label="Текущий PIN" value={pins.current} onChange={(value) => setPin('current', value)} visible={visible.current} onToggle={() => setVisible((current) => ({ ...current, current: !current.current }))} error={errors.current} />
          <PinField label="Новый PIN" value={pins.next} onChange={(value) => setPin('next', value)} visible={visible.next} onToggle={() => setVisible((current) => ({ ...current, next: !current.next }))} error={errors.next} />
          <PinField label="Повторите PIN" value={pins.repeat} onChange={(value) => setPin('repeat', value)} visible={visible.repeat} onToggle={() => setVisible((current) => ({ ...current, repeat: !current.repeat }))} error={errors.repeat} />
        </div>

        <div className="security-profile__pin-note">
          <LockIcon />
          <span>Используйте PIN, который не совпадает с кодом телефона или банковской карты.</span>
        </div>

        <button className="security-profile__primary" type="submit" disabled={busy.pin}>
          {busy.pin ? 'Изменяем…' : 'Изменить PIN'}
        </button>
      </form>

      <section className="security-profile__preferences-card">
        <header className="security-profile__preferences-head">
          <div className="security-profile__section-icon"><LockIcon /></div>
          <div>
            <span>Автоблокировка</span>
            <h2>Защита при бездействии</h2>
            <p>Эти параметры применяются ко всему кабинету и начинают действовать сразу после сохранения.</p>
          </div>
        </header>

        <div className="security-profile__policy-row">
          <div>
            <strong>Автоматически блокировать кабинет</strong>
            <span>PIN потребуется после периода без активности.</span>
          </div>
          <button
            type="button"
            className={`security-profile__switch ${policy.autoLock ? 'is-on' : ''}`}
            role="switch"
            aria-checked={policy.autoLock}
            onClick={() => setPolicy((current) => ({ ...current, autoLock: !current.autoLock }))}
          ><span /></button>
        </div>

        <label className="security-profile__policy-select">
          <span>Блокировать после</span>
          <select
            value={policy.sessionMinutes}
            disabled={!policy.autoLock}
            onChange={(event) => setPolicy((current) => ({ ...current, sessionMinutes: Number(event.target.value) }))}
          >
            <option value={5}>5 минут</option>
            <option value={15}>15 минут</option>
            <option value={30}>30 минут</option>
            <option value={60}>60 минут</option>
          </select>
        </label>

        <div className="security-profile__policy-status">
          <i className={policy.autoLock ? 'is-active' : ''} />
          <span>{policy.autoLock ? `Кабинет заблокируется через ${policy.sessionMinutes} мин. бездействия` : 'Автоблокировка отключена'}</span>
        </div>

        <button
          type="button"
          className="security-profile__primary"
          disabled={busy.preferences}
          onClick={() => onSavePreferences?.(policy)}
        >
          {busy.preferences ? 'Сохраняем…' : 'Сохранить политику'}
        </button>
      </section>

      <section className="security-profile__sessions-card">
        <header className="security-profile__sessions-head">
          <div>
            <span>Безопасность</span>
            <h2>Активные сессии</h2>
            <p>Устройства, на которых открыт ваш кабинет.</p>
          </div>
          {otherSessions.length ? (
            <button type="button" className={`security-profile__logout-all ${confirmAll ? 'is-confirming' : ''}`} onClick={handleRevokeOthers} disabled={busy.sessions}>
              <ExitIcon />
              <span>{confirmAll ? 'Подтвердить выход' : 'Выйти везде'}</span>
            </button>
          ) : null}
        </header>

        <div className="security-profile__sessions-list">
          {sessions.map((session, index) => (
            <article className={`security-profile__session ${session.current ? 'is-current' : ''}`} key={session.id} style={{ '--session-index': index }}>
              <div className="security-profile__device-icon">
                {session.device === 'mobile' ? <MobileIcon /> : <DesktopIcon />}
              </div>
              <div className="security-profile__session-copy">
                <div>
                  <strong>{session.title}</strong>
                  {session.current ? <span className="security-profile__current-pill">Текущая</span> : null}
                </div>
                <p>{[session.ip, session.location].filter(Boolean).join(' · ') || 'IP и геопозиция появятся после подключения session API'}</p>
                <small>{session.time}</small>
              </div>
              {!session.current ? (
                <button type="button" className="security-profile__session-exit" onClick={() => onRevokeSession(session.id)} disabled={busy.sessions} aria-label={`Завершить сессию ${session.title}`}>
                  <ExitIcon />
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
