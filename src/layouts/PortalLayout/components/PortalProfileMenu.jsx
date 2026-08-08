import React, { memo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import usePortalProfile from '../hooks/usePortalProfile';
import { LockIcon, ProfileIcon, ShieldMiniIcon } from '../icons';

function CompanyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 19V6.5H14V19M14 10H18V19M9 9H11M9 12H11M9 15H11M16 13H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function AppearanceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4.2a7.8 7.8 0 1 0 0 15.6h1.1c1.2 0 2-1.2 1.5-2.3-.5-1.1.3-2.3 1.5-2.3h1.1A2.8 2.8 0 0 0 20 12.4 8.2 8.2 0 0 0 12 4.2Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="8.2" cy="10" r="1" fill="currentColor"/><circle cx="11.2" cy="7.8" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/></svg>;
}

function UsersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="2.8" stroke="currentColor" strokeWidth="1.6"/><path d="M4.8 18C5.7 15.6 7.1 14.4 9 14.4C10.9 14.4 12.3 15.6 13.2 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M14.8 7.2C16.5 7.2 17.7 8.4 17.7 10C17.7 11.5 16.6 12.6 15.2 12.8M15.5 15C17.4 15.3 18.7 16.3 19.3 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
}

function PortalProfileMenu({ open, onClose, onLock }) {
  const navigate = useNavigate();
  const profile = usePortalProfile();
  const rootRef = useRef(null);

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

  const go = (route) => {
    onClose();
    navigate(route);
  };

  return (
    <div ref={rootRef} className="portal-popover portal-popover--profile">
      <div className="portal-profile-menu__identity">
        <div className="portal-profile-menu__avatar">
          {profile.avatar ? <img src={profile.avatar} alt="" /> : profile.initials}
        </div>
        <div>
          <strong>{profile.fullName}</strong>
          <span>{profile.roleLabel || profile.position || 'Пользователь'}</span>
        </div>
      </div>

      <div className="portal-profile-menu__section">
        <button type="button" onClick={() => go('/profile')}>
          <span><ProfileIcon /></span>
          <div><strong>Аккаунт</strong><small>Профиль, контакты и настройки</small></div>
        </button>
        {profile.capabilities.canViewCompany ? (
          <button type="button" onClick={() => go('/profile?tab=company')}>
            <span><CompanyIcon /></span>
            <div><strong>Компания</strong><small>Реквизиты организации</small></div>
          </button>
        ) : null}
        {profile.capabilities.canViewUsers ? (
          <button type="button" onClick={() => go('/profile?tab=users')}>
            <span><UsersIcon /></span>
            <div><strong>Команда</strong><small>Роли, доступы и безопасность</small></div>
          </button>
        ) : null}
        <button type="button" onClick={() => go('/profile?tab=security')}>
          <span><ShieldMiniIcon /></span>
          <div><strong>Безопасность</strong><small>PIN и активные сессии</small></div>
        </button>
        <button type="button" onClick={() => go('/profile?tab=appearance')}>
          <span><AppearanceIcon /></span>
          <div><strong>Оформление</strong><small>Светлая, тёмная или системная тема</small></div>
        </button>
      </div>

      <div className="portal-profile-menu__lock">
        <button type="button" onClick={() => { onClose(); onLock?.(); }}>
          <span><LockIcon /></span>
          <div><strong>Заблокировать кабинет</strong><small>Для продолжения потребуется PIN</small></div>
        </button>
      </div>
    </div>
  );
}

export default memo(PortalProfileMenu);
