import React, { memo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import usePortalProfile from '../hooks/usePortalProfile';
import { LockIcon, ProfileIcon, SubscriptionsIcon, FaqIcon } from '../icons';
import useOrganizationContext from '../../../features/access/hooks/useOrganizationContext';
import useAccessControl from '../../../features/access/hooks/useAccessControl';
import { findFirstAllowedRoute, getCurrentAccessContext, getRoleLabel } from '../../../services/access/rbacService';
import './PortalProfileMenuRecovery.scss';

const focusableSelector = 'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

function PortalProfileMenu({ open, onClose, onLock, triggerRef }) {
  const navigate = useNavigate();
  const profile = usePortalProfile();
  const access = useAccessControl();
  const organizations = useOrganizationContext({ enabled: open });
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const triggerElement = triggerRef?.current;
    window.requestAnimationFrame(() => rootRef.current?.querySelector(focusableSelector)?.focus());

    const handleOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) onClose();
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(rootRef.current?.querySelectorAll(focusableSelector) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleKey);
      const restoreTarget = triggerElement || previouslyFocused;
      if (restoreTarget instanceof HTMLElement && document.contains(restoreTarget)) restoreTarget.focus();
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  const go = (route) => {
    onClose();
    navigate(route);
  };

  const switchOrganization = async (organizationId) => {
    if (organizationId === organizations.activeOrganizationId || organizations.switchingId) return;
    try {
      const user = await organizations.select(organizationId);
      if (!user) return;
      onClose();
      const completed = user.membership?.organization?.onboardingStatus === 'COMPLETED';
      navigate(completed ? findFirstAllowedRoute(getCurrentAccessContext(user.membership)) : '/onboarding', { replace: true });
    } catch {
      // Keep previous tenant active; hook exposes the recoverable error.
    }
  };

  const activeWorkspace = organizations.items.find(({ organization }) => organization.id === organizations.activeOrganizationId);

  return (
    <div id="portal-profile-menu" ref={rootRef} className="portal-popover portal-popover--profile portal-profile-menu--simple" role="dialog" aria-modal="false" aria-label="Аккаунт" tabIndex="-1">
      <div className="portal-profile-menu__identity">
        <div className="portal-profile-menu__avatar">
          {profile.avatar ? <img src={profile.avatar} alt="" /> : profile.initials}
        </div>
        <div>
          <strong>{profile.fullName}</strong>
          <span>{profile.roleLabel || profile.position || 'Пользователь'}</span>
        </div>
      </div>

      {organizations.error ? <div className="portal-profile-menu__notice" role="alert">{organizations.error}</div> : null}

      {activeWorkspace ? (
        <div className="portal-profile-menu__workspaceSummary">
          <span>{String(activeWorkspace.organization.name || 'О').trim().slice(0, 1).toUpperCase()}</span>
          <div><small>Рабочее пространство</small><strong>{activeWorkspace.organization.name}</strong></div>
          {organizations.items.length > 1 ? <em>{organizations.items.length}</em> : <i>✓</i>}
        </div>
      ) : organizations.items.length === 0 ? (
        <div className="portal-profile-menu__workspaceRecovery">
          <div><strong>Нет активных организаций</strong><small>Обновите список или завершите настройку рабочего пространства.</small></div>
          <button type="button" onClick={() => organizations.load?.()}>Обновить</button>
        </div>
      ) : null}

      {organizations.items.length > 1 ? (
        <details className="portal-profile-menu__workspacePicker" open>
          <summary>Сменить пространство</summary>
          <div>
            {organizations.items.map(({ organization, membership }) => {
              const active = organization.id === organizations.activeOrganizationId;
              return (
                <button
                  key={organization.id}
                  type="button"
                  aria-disabled={active ? 'true' : undefined}
                  disabled={!active && Boolean(organizations.switchingId)}
                  onClick={() => switchOrganization(organization.id)}
                >
                  <span>{organization.name}</span><small>{active ? 'Текущее' : getRoleLabel(membership?.role)}</small>
                </button>
              );
            })}
          </div>
        </details>
      ) : null}

      <div className="portal-profile-menu__simpleActions">
        <button type="button" onClick={() => go('/profile')}>
          <span><ProfileIcon /></span><div><strong>Настройки</strong><small>Аккаунт, компания, команда и безопасность</small></div>
        </button>
        {access.can('billing.view') ? (
          <button type="button" onClick={() => go('/subscriptions')}>
            <span><SubscriptionsIcon /></span><div><strong>Тариф и оплата</strong><small>План, лимиты и PRO</small></div>
          </button>
        ) : null}
        {access.can('support.view') ? (
          <button type="button" onClick={() => go('/faq')}>
            <span><FaqIcon /></span><div><strong>Помощь</strong><small>FAQ и поддержка</small></div>
          </button>
        ) : null}
      </div>

      <button type="button" className="portal-profile-menu__simpleLock" onClick={() => { onClose(); onLock?.(); }}>
        <LockIcon /><span>Заблокировать кабинет</span>
      </button>
    </div>
  );
}

export default memo(PortalProfileMenu);
