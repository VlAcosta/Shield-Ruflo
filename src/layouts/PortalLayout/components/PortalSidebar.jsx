import React, { memo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LockIcon, MoonIcon, SunIcon } from '../icons';
import BrandMark from '../../../components/brand/BrandMark';
import { navigationItems } from '../navigation';
import useAccessControl from '../../../features/access/hooks/useAccessControl';
import { findFirstAllowedRoute } from '../../../services/access/rbacService';
import useAppearance from '../../../features/appearance/hooks/useAppearance';
import { APPEARANCE_MODES } from '../../../services/appearance/appearanceService';
import { authService } from '../../../services/auth/authService';

function PortalSidebar({ onLock, navigationLocked = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAccessControl();
  const appearance = useAppearance();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [lockedHint, setLockedHint] = useState('');
  const brandTarget = navigationLocked ? '/onboarding' : findFirstAllowedRoute(access);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await authService.logout();
      navigate('/auth?mode=login', { replace: true });
    } catch (error) {
      setLogoutError(error?.message || 'Не удалось завершить сессию. Повторите попытку.');
      setLoggingOut(false);
    }
  };

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
            const explanation = 'Доступ откроется после завершения настройки';
            return (
              <button
                key={to}
                type="button"
                className="portal__navItem portal__navItem--locked"
                aria-disabled="true"
                aria-describedby={lockedHint ? 'portal-navigation-lock-hint' : undefined}
                title={explanation}
                onClick={() => setLockedHint(explanation)}
                onFocus={() => setLockedHint(explanation)}
              >
                <span className="portal__navIcon"><Icon /></span>
                <span className="portal__navText">{label}</span>
                <span className="portal__navLock" aria-hidden="true"><LockIcon /></span>
              </button>
            );
          }

          if (!allowed) {
            const explanation = `Нет доступа. Текущая роль: ${access.role?.label || 'роль организации'}`;
            return (
              <button
                key={to}
                type="button"
                className="portal__navItem portal__navItem--permission-locked"
                aria-disabled="true"
                aria-describedby={lockedHint ? 'portal-navigation-lock-hint' : undefined}
                title={explanation}
                onClick={() => setLockedHint(explanation)}
                onFocus={() => setLockedHint(explanation)}
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
      {lockedHint ? <p id="portal-navigation-lock-hint" className="portal__navLockedHint" role="status" aria-live="polite">{lockedHint}</p> : null}

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

      <div className="portal__logoutDock">
        {logoutError ? <div className="portal__logoutError" role="alert" aria-live="assertive">{logoutError}</div> : null}
        <button type="button" className="portal__logoutButton" onClick={logout} disabled={loggingOut}>
          <span aria-hidden="true">↪</span>
          <strong>{loggingOut ? 'Завершаем сессию…' : 'Выйти из аккаунта'}</strong>
        </button>
      </div>

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
