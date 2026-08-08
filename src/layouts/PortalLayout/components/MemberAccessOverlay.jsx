import React from 'react';
import { signOutCurrentSession } from '../../../services/security/teamSecurityService';

function ShieldLockIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 52 12v14c0 14-8.4 24.2-20 29-11.6-4.8-20-15-20-29V12L32 5Z" fill="none" stroke="currentColor" strokeWidth="3"/><rect x="23" y="27" width="18" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M27 27v-4a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
}

const COPY = {
  frozen: {
    eyebrow: 'ACCESS PAUSED',
    title: 'Доступ к компании приостановлен',
    text: 'Администратор временно заморозил ваш доступ. Данные компании остаются защищены, а рабочая сессия остановлена.',
    note: 'Для восстановления доступа обратитесь к владельцу или администратору компании.',
  },
  expired: {
    eyebrow: 'TEMPORARY ACCESS',
    title: 'Срок временного доступа завершён',
    text: 'Период, на который вам был открыт кабинет компании, закончился. Продлить доступ может администратор команды.',
    note: 'Ваш профиль и история действий сохранятся после продления.',
  },
  revoked: {
    eyebrow: 'SESSION CLOSED',
    title: 'Сессия завершена администратором',
    text: 'Все активные устройства были отключены в рамках политики безопасности компании.',
    note: 'Если доступ всё ещё разрешён, войдите в кабинет заново.',
  },
};

export default function MemberAccessOverlay({ reason = 'revoked', security }) {
  const copy = COPY[reason] || COPY.revoked;
  const logout = () => {
    signOutCurrentSession();
    window.location.assign('/auth?mode=login');
  };

  return (
    <div className={`member-access-overlay is-${reason}`} role="dialog" aria-modal="true" aria-labelledby="member-access-title">
      <div className="member-access-overlay__aurora" />
      <section className="member-access-overlay__card">
        <div className="member-access-overlay__icon"><ShieldLockIcon/><i/></div>
        <span className="member-access-overlay__eyebrow">{copy.eyebrow}</span>
        <h2 id="member-access-title">{copy.title}</h2>
        <p>{copy.text}</p>
        {reason === 'expired' && security?.accessExpiresAt ? <div className="member-access-overlay__meta"><span>Доступ действовал до</span><strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(security.accessExpiresAt))}</strong></div> : null}
        {reason === 'frozen' && security?.frozenReason ? <div className="member-access-overlay__meta"><span>Комментарий</span><strong>{security.frozenReason}</strong></div> : null}
        <div className="member-access-overlay__note"><i/><span>{copy.note}</span></div>
        <button type="button" onClick={logout}>{reason === 'revoked' ? 'Войти снова' : 'Войти другим аккаунтом'}</button>
      </section>
    </div>
  );
}
