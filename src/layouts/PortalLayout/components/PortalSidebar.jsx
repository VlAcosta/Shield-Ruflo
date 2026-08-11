import React, { memo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LockIcon, MoonIcon, SunIcon } from '../icons';
import BrandMark from '../../../components/brand/BrandMark';
import { navigationHelp, navigationPrimary } from '../navigation';
import useAccessControl from '../../../features/access/hooks/useAccessControl';
import { findFirstAllowedRoute } from '../../../services/access/rbacService';
import useAppearance from '../../../features/appearance/hooks/useAppearance';
import { authService } from '../../../services/auth/authService';
import './PortalSidebarRecovery.scss';

function PortalSidebar({ onLock, navigationLocked = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAccessControl();
  const appearance = useAppearance();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const brandTarget = navigationLocked ? '/onboarding' : findFirstAllowedRoute(access);

  const allowed = (item) => !item.permission || access.can(item.permission);
  const visiblePrimary = navigationPrimary.filter(allowed);
  const HelpIcon = navigationHelp.Icon;

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
    <aside className="portal__sidebar portal__sidebar--simple">
      <Link to={brandTarget} className="portal__brand" aria-label={navigationLocked ? 'Настройка организации' : 'Главная'}>
        <span className="portal__shield"><BrandMark size={32} /></span>
        <span className="portal__brandName">БИЗНЕС<br />ЩИТ</span>
      </Link>

      {navigationLocked ? (
        <div className="portal__onboardingNav">
          <NavLink to="/onboarding" className="portal__navItem is-active">
            <span className="portal__navIcon"><LockIcon /></span>
            <span className="portal__navText"><strong>Настройка организации</strong><small>Завершите 3 шага</small></span>
          </NavLink>
          <p>Основные разделы появятся после первичной настройки.</p>
        </div>
      ) : (
        <nav className="portal__nav portal__nav--compact" aria-label="Основные разделы">
          {visiblePrimary.map(({ to, label, Icon }) => {
            const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
            return (
              <NavLink key={to} to={to} className={`portal__navItem portal__navItem--primary ${active ? 'is-active' : ''}`}>
                <span className="portal__navIcon"><Icon /></span>
                <span className="portal__navText">{label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}

      {!navigationLocked ? (
        <div className="portal__sidebarUtility">
          {allowed(navigationHelp) ? (
            <NavLink to={navigationHelp.to} className="portal__utilityLink">
              <HelpIcon />
              <span>{navigationHelp.label}</span>
            </NavLink>
          ) : null}
          <button
            type="button"
            className="portal__utilityLink"
            onClick={appearance.toggleResolvedTheme}
            aria-label={appearance.isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
          >
            {appearance.isDark ? <MoonIcon /> : <SunIcon />}
            <span>{appearance.isDark ? 'Тёмная тема' : 'Светлая тема'}</span>
          </button>
          {typeof onLock === 'function' ? (
            <button type="button" className="portal__utilityLink" onClick={onLock}>
              <LockIcon /><span>Заблокировать</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="portal__logoutDock portal__logoutDock--simple">
        {logoutError ? <div className="portal__logoutError" role="alert">{logoutError}</div> : null}
        <button type="button" className="portal__logoutButton" onClick={logout} disabled={loggingOut}>
          <span aria-hidden="true">↪</span>
          <strong>{loggingOut ? 'Выходим…' : 'Выйти'}</strong>
        </button>
      </div>
    </aside>
  );
}

export default memo(PortalSidebar);
