import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraIcon, DesktopIcon, MobileIcon, ShieldIcon } from '../model/icons';
import { getInitials } from '../model/profileData';
import ContactChangeModal from './ContactChangeModal';
import {
  ACCOUNT_CHANGED_EVENT,
  getAccountCenterState
} from '../../../services/account/accountService';
import {
  getNotificationsSnapshot,
  saveNotificationSettings,
} from '../../../services/notifications/notificationService';
import {
  COMPANY_ACTIVITY_CHANGED_EVENT,
  readCompanyActivity,
  recordCompanyActivity,
} from '../../../services/activity/companyActivityService';
import './AccountCenter.scss';

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function MailIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.7"/><path d="m6 8 6 5 6-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function PhoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.2 4.5 10 8.2 8.7 9.7c1.2 2.4 3.2 4.4 5.6 5.6l1.5-1.3 3.7 1.8-.3 2.2c-.2 1.2-1.2 2-2.4 2C9.7 19.8 4.2 14.3 4 7.2 4 6 4.8 5 6 4.8l2.2-.3Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10a5 5 0 0 1 10 0v3.2l1.5 2.3H5.5L7 13.2V10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M10 18a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}
function ActivityIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h4l2-5 3.5 10 2.3-5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6.5 12.5 3.4 3.4 7.6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function SparkIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3ZM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
}

const CHANNEL_META = {
  email: { label: 'Email', caption: 'Дайджесты и важные события', icon: '@' },
  telegram: { label: 'Telegram', caption: 'Быстрые уведомления от бота', icon: 'TG' },
  push: { label: 'Push', caption: 'Уведомления в этом браузере', icon: '●' },
};

const formatTime = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minute = 60000;
  if (diff < minute) return 'только что';
  if (diff < 60 * minute) return `${Math.max(1, Math.round(diff / minute))} мин. назад`;
  if (diff < 24 * 60 * minute) return `${Math.max(1, Math.round(diff / (60 * minute)))} ч. назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

async function prepareAvatar(file) {
  if (!file || !file.type.startsWith('image/')) return '';
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const max = 512;
    const ratio = Math.min(1, max / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/webp', .86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button type="button" className={`account-center__switch ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}>
      <span />
    </button>
  );
}

export default function AccountCenter({ value, company, sessions = [], busy, onSave, onOpenSecurity, onOpenNotifications }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState(value);
  const [accountState, setAccountState] = useState(getAccountCenterState);
  const [contactModal, setContactModal] = useState(null);
  const [notificationSnapshot, setNotificationSnapshot] = useState(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [activity, setActivity] = useState(readCompanyActivity);

  useEffect(() => setForm(value), [value]);

  useEffect(() => {
    let active = true;
    getNotificationsSnapshot().then((snapshot) => {
      if (active) setNotificationSnapshot(snapshot);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const syncAccount = (event) => setAccountState(event?.detail || getAccountCenterState());
    const syncActivity = () => setActivity(readCompanyActivity());
    window.addEventListener(ACCOUNT_CHANGED_EVENT, syncAccount);
    window.addEventListener(COMPANY_ACTIVITY_CHANGED_EVENT, syncActivity);
    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, syncAccount);
      window.removeEventListener(COMPANY_ACTIVITY_CHANGED_EVENT, syncActivity);
    };
  }, []);

  const initials = useMemo(() => getInitials(form.firstName, form.lastName), [form.firstName, form.lastName]);
  const fullName = `${form.firstName || ''} ${form.lastName || ''}`.trim() || 'Пользователь';
  const activeSessions = useMemo(() => sessions.filter(Boolean), [sessions]);
  const currentSession = useMemo(() => sessions.find((session) => session.current) || sessions[0], [sessions]);

  const completion = useMemo(() => {
    const checks = [
      form.avatar,
      form.firstName,
      form.lastName,
      form.position,
      form.email && accountState.verifiedContacts.email,
      form.phone && accountState.verifiedContacts.phone,
      form.telegram,
      company?.verified,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [accountState.verifiedContacts.email, accountState.verifiedContacts.phone, company?.verified, form]);

  const recentActivity = useMemo(() => {
    const email = String(form.email || '').trim().toLowerCase();
    const own = activity.filter((item) => String(item.actor?.email || '').trim().toLowerCase() === email);
    return own.slice(0, 5);
  }, [activity, form.email]);

  const update = useCallback((key, nextValue) => {
    setForm((current) => ({ ...current, [key]: nextValue }));
  }, []);

  const handleAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const avatar = await prepareAvatar(file);
      if (avatar) update('avatar', avatar);
    } catch {
      // Keep the current avatar when the browser cannot process the image.
    }
  };

  const saveForm = async (event) => {
    event.preventDefault();
    const ok = await onSave(form);
    if (ok) recordCompanyActivity({ type: 'account_profile_updated', title: 'Обновлены личные данные', detail: 'Профиль аккаунта', tone: 'neutral' });
  };

  const saveContact = async (type, nextValue) => {
    const next = { ...form, [type]: nextValue };
    const ok = await onSave(next);
    if (ok) {
      setForm(next);
      recordCompanyActivity({ type: 'account_contact_changed', title: type === 'email' ? 'Изменён email аккаунта' : 'Изменён телефон аккаунта', detail: nextValue, tone: 'success' });
    }
    return ok;
  };

  const toggleChannel = async (channelId) => {
    if (!notificationSnapshot || notificationBusy) return;
    const currentSettings = notificationSnapshot.settings || {};
    const nextSettings = {
      ...currentSettings,
      channels: {
        ...(currentSettings.channels || {}),
        [channelId]: !currentSettings.channels?.[channelId],
      },
    };
    const previous = notificationSnapshot;
    const optimistic = { ...notificationSnapshot, settings: nextSettings };
    setNotificationSnapshot(optimistic);
    setNotificationBusy(true);
    try {
      const result = await saveNotificationSettings(nextSettings, previous);
      setNotificationSnapshot(result?.snapshot || optimistic);
    } catch {
      setNotificationSnapshot(previous);
    } finally {
      setNotificationBusy(false);
    }
  };

  const notificationSettings = notificationSnapshot?.settings || null;

  return (
    <div className="account-center">
      <section className="account-center__hero">
        <div className="account-center__heroGlow" aria-hidden="true" />
        <div className="account-center__identity">
          <div className="account-center__avatarWrap">
            <div className="account-center__avatar">{form.avatar ? <img src={form.avatar} alt="" /> : initials}</div>
            <button type="button" className="account-center__avatarAction" onClick={() => fileRef.current?.click()} aria-label="Изменить фотографию"><CameraIcon /></button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} hidden />
          </div>
          <div className="account-center__identityCopy">
            <span className="account-center__kicker"><i /> ACCOUNT CENTER</span>
            <h2>{fullName}</h2>
            <p>{form.position || 'Участник компании'} · {company?.title || 'Бизнес Щит'}</p>
            <div className="account-center__badges">
              <span><ShieldIcon /> Защищён PIN</span>
              {company?.verified ? <span><CheckIcon /> Компания подтверждена</span> : null}
            </div>
          </div>
        </div>

        <div className="account-center__readiness">
          <div className="account-center__readinessRing" style={{ '--account-progress': `${completion * 3.6}deg` }}>
            <div><strong>{completion}%</strong><span>готово</span></div>
          </div>
          <div>
            <span>Профиль аккаунта</span>
            <strong>{completion === 100 ? 'Полностью настроен' : 'Есть что улучшить'}</strong>
            <p>{completion === 100 ? 'Контакты подтверждены, профиль готов к работе.' : 'Заполните оставшиеся данные — они используются в команде и отчётах.'}</p>
          </div>
        </div>
      </section>

      <div className="account-center__grid">
        <form className="account-center__card account-center__card--details" onSubmit={saveForm}>
          <header className="account-center__cardHead">
            <div>
              <span>ЛИЧНЫЕ ДАННЫЕ</span>
              <h3>Карточка пользователя</h3>
              <p>Имя и должность видят коллеги внутри вашей организации.</p>
            </div>
            <span className="account-center__secure"><i /> защищено</span>
          </header>

          <div className="account-center__fields">
            <label><span>Имя</span><input value={form.firstName || ''} onChange={(event) => update('firstName', event.target.value)} autoComplete="given-name" /></label>
            <label><span>Фамилия</span><input value={form.lastName || ''} onChange={(event) => update('lastName', event.target.value)} autoComplete="family-name" /></label>
            <label><span>Должность</span><input value={form.position || ''} onChange={(event) => update('position', event.target.value)} placeholder="Например, директор" /></label>
            <label><span>Telegram</span><input value={form.telegram || ''} onChange={(event) => update('telegram', event.target.value)} placeholder="@username" /></label>
          </div>

          <footer className="account-center__formFooter">
            <span>Изменения синхронизируются с верхним меню и командой.</span>
            <button type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
          </footer>
        </form>

        <section className="account-center__card account-center__card--contacts">
          <header className="account-center__cardHead">
            <div>
              <span>КОНТАКТЫ</span>
              <h3>Точки восстановления</h3>
              <p>Используются для входа, важных уведомлений и восстановления доступа.</p>
            </div>
          </header>

          <div className="account-center__contactList">
            <article className="account-center__contact">
              <div className="account-center__contactIcon"><MailIcon /></div>
              <div className="account-center__contactCopy">
                <span>Email</span>
                <strong>{form.email || 'Не указан'}</strong>
                <small className={accountState.verifiedContacts.email ? 'is-verified' : ''}>{accountState.verifiedContacts.email ? '● Подтверждён' : '○ Требует подтверждения'}</small>
              </div>
              <button type="button" onClick={() => setContactModal('email')}>Изменить</button>
            </article>

            <article className="account-center__contact">
              <div className="account-center__contactIcon account-center__contactIcon--phone"><PhoneIcon /></div>
              <div className="account-center__contactCopy">
                <span>Телефон</span>
                <strong>{form.phone || 'Не указан'}</strong>
                <small className={accountState.verifiedContacts.phone ? 'is-verified' : ''}>{accountState.verifiedContacts.phone ? '● Подтверждён' : '○ Требует подтверждения'}</small>
              </div>
              <button type="button" onClick={() => setContactModal('phone')}>Изменить</button>
            </article>
          </div>

          <div className="account-center__contactNote">
            <ShieldIcon />
            <div><strong>Контакты меняются только через подтверждение</strong><span>Для production backend должен повторно проверить активную сессию и одноразовый код.</span></div>
          </div>
        </section>

        <section className="account-center__card account-center__card--notifications">
          <header className="account-center__cardHead">
            <div>
              <span>УВЕДОМЛЕНИЯ</span>
              <h3>Личные каналы</h3>
              <p>Быстрая настройка того, куда Бизнес Щит отправляет события именно вам.</p>
            </div>
            <div className="account-center__headIcon"><BellIcon /></div>
          </header>

          <div className="account-center__preferenceList">
            {Object.entries(CHANNEL_META).map(([id, meta], index) => (
              <div className="account-center__preference" key={id} style={{ '--account-row-delay': `${index * 55}ms` }}>
                <span className={`account-center__preferenceIcon account-center__preferenceIcon--${id}`}>{meta.icon}</span>
                <div><strong>{meta.label}</strong><span>{meta.caption}</span></div>
                <Toggle checked={Boolean(notificationSettings?.channels?.[id])} disabled={!notificationSettings || notificationBusy} label={`${meta.label}: ${notificationSettings?.channels?.[id] ? 'включено' : 'выключено'}`} onChange={() => toggleChannel(id)} />
              </div>
            ))}
          </div>

          <button type="button" className="account-center__textAction" onClick={onOpenNotifications}>Все настройки уведомлений <ArrowIcon /></button>
        </section>

        <section className="account-center__card account-center__card--security">
          <header className="account-center__cardHead">
            <div>
              <span>ВАША БЕЗОПАСНОСТЬ</span>
              <h3>Сессии и устройства</h3>
              <p>Короткая сводка по текущему входу. Полный контроль находится в разделе безопасности.</p>
            </div>
            <div className="account-center__headIcon account-center__headIcon--green"><ShieldIcon /></div>
          </header>

          <div className="account-center__securityMetric">
            <div><strong>{activeSessions.length}</strong><span>активных устройств</span></div>
            <span className="account-center__securityPulse"><i /> защита активна</span>
          </div>

          {currentSession ? (
            <article className="account-center__currentDevice">
              <span className="account-center__deviceIcon">{currentSession.device === 'mobile' ? <MobileIcon /> : <DesktopIcon />}</span>
              <div><strong>{currentSession.title || 'Текущее устройство'}</strong><span>{currentSession.current ? 'Текущая сессия' : 'Последняя активная сессия'} · {currentSession.time || 'активно'}</span></div>
              <i />
            </article>
          ) : (
            <div className="account-center__emptyMini">Данные об устройствах появятся после подключения session API.</div>
          )}

          <button type="button" className="account-center__textAction" onClick={onOpenSecurity}>Управлять безопасностью <ArrowIcon /></button>
        </section>

        <section className="account-center__card account-center__card--activity">
          <header className="account-center__cardHead">
            <div>
              <span>ACCOUNT ACTIVITY</span>
              <h3>Последние действия</h3>
              <p>История изменений вашего аккаунта и входов в рабочее пространство.</p>
            </div>
            <div className="account-center__headIcon account-center__headIcon--purple"><ActivityIcon /></div>
          </header>

          <div className="account-center__activityList">
            {recentActivity.length ? recentActivity.map((item, index) => (
              <article className="account-center__activityItem" key={item.id} style={{ '--account-row-delay': `${index * 45}ms` }}>
                <span className={`account-center__activityDot account-center__activityDot--${item.tone || 'neutral'}`} />
                <div><strong>{item.title}</strong><span>{item.detail || 'Действие в кабинете'}</span></div>
                <time>{formatTime(item.createdAt)}</time>
              </article>
            )) : (
              <div className="account-center__activityEmpty">
                <SparkIcon />
                <div><strong>История только начинается</strong><span>Входы, изменения профиля и действия безопасности появятся здесь автоматически.</span></div>
              </div>
            )}
          </div>
        </section>
      </div>

      <ContactChangeModal
        open={Boolean(contactModal)}
        type={contactModal || 'email'}
        currentValue={contactModal ? form[contactModal] : ''}
        onClose={() => setContactModal(null)}
        onVerified={(nextValue) => saveContact(contactModal, nextValue)}
      />
    </div>
  );
}
