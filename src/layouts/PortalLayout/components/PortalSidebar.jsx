import React, { memo } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LockIcon, MoonIcon, SunIcon } from '../icons';
import BrandMark from '../../../components/brand/BrandMark';
import { navigationItems } from '../navigation';
import useAccessControl from '../../../features/access/hooks/useAccessControl';
import { findFirstAllowedRoute } from '../../../services/access/rbacService';
import useAppearance from '../../../features/appearance/hooks/useAppearance';
import { APPEARANCE_MODES } from '../../../services/appearance/appearanceService';

function PortalSidebar({ onLock, navigationLocked = false }) {
  const location = useLocation();
  const access = useAccessControl();
  const appearance = useAppearance();
  const brandTarget = navigationLocked ? '/onboarding' : findFirstAllowedRoute(access);

  return (
    <aside className="portal__sidebar">
      <Link
        to={brandTarget}
        className="portal__brand"
        aria-label={navigationLocked ? 'Настройки первого входа' : 'Главная'}
      >
        <span className="portal__shield"><BrandMark size={32} /></span>
        <span className="portal__brandName">БИЗНЕС<br />ЩИТ</span>
      </Link>

      <nav className="portal__nav" aria-label="Навигация кабинета">
        {navigationItems.map(({ to, label, Icon, permission }) => {
          const allowed = !permission || access.can(permission);
          const isActive = !navigationLocked && (location.pathname === to || location.pathname.startsWith(`${to}/`));

          if (navigationLocked) {
            return (
              <button
                key={to}
                type="button"
                className="portal__navItem portal__navItem--locked"
                disabled
                aria-disabled="true"
                title="Доступ откроется после завершения настройки"
              >
                <span className="portal__navIcon"><Icon /></span>
                <span className="portal__navText">{label}</span>
                <span className="portal__navLock" aria-hidden="true"><LockIcon /></span>
              </button>
            );
          }

          if (!allowed) {
            return (
              <button
                key={to}
                type="button"
                className="portal__navItem portal__navItem--permission-locked"
                disabled
                aria-disabled="true"
                title={`Нет доступа · ${access.role?.label || 'Роль'}`}
              >
                <span className="portal__navIcon"><Icon /></span>
                <span className="portal__navText">{label}</span>
                <span className="portal__navLock" aria-hidden="true"><LockIcon /></span>
              </button>
            );
          }

          return (
            <NavLink key={to} to={to} className={`portal__navItem ${isActive ? 'is-active' : ''}`}>
              <span className="portal__navIcon"><Icon /></span>
              <span className="portal__navText">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {!navigationLocked ? (
        <div className="portal__appearanceDock">
          <button
            type="button"
            className={`portal__appearanceQuick ${appearance.isDark ? 'is-dark' : 'is-light'}`}
            onClick={appearance.toggleResolvedTheme}
            aria-pressed={appearance.isDark}
            aria-label={appearance.isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
            title={appearance.isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
          >
            <span className="portal__appearanceQuickIcon" aria-hidden="true">
              {appearance.isDark ? <MoonIcon /> : <SunIcon />}
            </span>
            <span className="portal__appearanceQuickCopy">
              <small>{appearance.mode === APPEARANCE_MODES.system ? 'Системная тема' : 'Оформление'}</small>
              <strong>{appearance.isDark ? 'Тёмная' : 'Светлая'}</strong>
            </span>
            <span className="portal__appearanceQuickSwitch" aria-hidden="true"><i /></span>
          </button>
          <Link className="portal__appearanceSettings" to="/profile?tab=appearance" aria-label="Открыть настройки оформления">
            Настроить
          </Link>
        </div>
      ) : null}

      {navigationLocked ? (
        <div className="portal__sidebarNotice">
          <span className="portal__sidebarNoticeIcon"><LockIcon /></span>
          <div>
            <strong>Кабинет закрыт</strong>
            <small>Завершите 3 шага настройки</small>
          </div>
        </div>
      ) : null}

    </aside>
  );
}

export default memo(PortalSidebar);
