import React, { memo } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LockIcon, MoonIcon, SunIcon } from '../icons';
import BrandMark from '../../../components/brand/BrandMark';
import { navigationHelp, navigationPrimary } from '../navigation';
import useAccessControl from '../../../features/access/hooks/useAccessControl';
import { findFirstAllowedRoute } from '../../../services/access/rbacService';
import { getPermissionAccessState } from '../../../services/access/planAccessService';
import useAppearance from '../../../features/appearance/hooks/useAppearance';
import './PortalSidebarRecovery.scss';

function PortalSidebar({ navigationLocked = false }) {
  const location = useLocation();
  const access = useAccessControl();
  const appearance = useAppearance();
  const brandTarget = navigationLocked ? '/onboarding' : findFirstAllowedRoute(access);

  const accessState = (item) => (
    item.permission ? getPermissionAccessState(item.permission, access) : 'allowed'
  );
  const visiblePrimary = navigationPrimary.filter((item) => accessState(item) !== 'role_denied');
  const HelpIcon = navigationHelp.Icon;

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
          {visiblePrimary.map(({ to, label, Icon, permission }) => {
            const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
            const planLocked = permission && getPermissionAccessState(permission, access) === 'plan_locked';
            return (
              <NavLink
                key={to}
                to={to}
                aria-label={planLocked ? `${label} · доступно в PRO` : label}
                className={`portal__navItem portal__navItem--primary ${active ? 'is-active' : ''} ${planLocked ? 'is-plan-locked' : ''}`}
              >
                <span className="portal__navIcon"><Icon /></span>
                <span className="portal__navText">{label}</span>
                {planLocked ? <small className="portal__planBadge">PRO</small> : null}
              </NavLink>
            );
          })}
        </nav>
      )}

      {!navigationLocked ? (
        <div className="portal__sidebarUtility">
          {!navigationHelp.permission || access.can(navigationHelp.permission) ? (
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
        </div>
      ) : null}
    </aside>
  );
}

export default memo(PortalSidebar);
