import React, { memo, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LockIcon, MoonIcon, SunIcon } from '../icons';
import BrandMark from '../../../components/brand/BrandMark';
import { navigationGroups, navigationHelp, navigationPrimary } from '../navigation';
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
  const visibleGroups = useMemo(() => navigationGroups
    .map((group) => ({ ...group, items: group.items.filter(allowed) }))
    .filter((group) => group.items.length > 0), [access]);

  const activeGroup = useMemo(() => visibleGroups.find((group) => group.items.some(({ to }) => (
    location.pathname === to || location.pathname.startsWith(`${to}/`)
  )))?.id || '', [location.pathname, visibleGroups]);
  const [openGroup, setOpenGroup] = useState(activeGroup || 'reputation');

  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);

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

  const renderDirect = ({ to, label, Icon, accent }) => {
    if (!allowed({ to, label, Icon, permission: navigationPrimary.find((item) => item.to === to)?.permission })) return null;
    const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
    return (
      <NavLink key={to} to={to} className={`portal__navItem portal__navItem--primary ${accent ? 'portal__navItem--accent' : ''} ${active ? 'is-active' : ''}`}>
        <span className="portal__navIcon"><Icon /></span>
        <span className="portal__navText">{label}</span>
      </NavLink>
    );
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
        <nav className="portal__nav portal__nav--grouped" aria-label="Навигация кабинета">
          {navigationPrimary.filter(allowed).map(renderDirect)}

          <div className="portal__navGroups">
            {visibleGroups.map((group) => {
              const GroupIcon = group.Icon;
              const expanded = openGroup === group.id;
              const groupActive = activeGroup === group.id;
              return (
                <section className={`portal__navGroup ${groupActive ? 'is-active' : ''}`} key={group.id}>
                  <button
                    type="button"
                    className="portal__navGroupButton"
                    aria-expanded={expanded}
                    onClick={() => setOpenGroup((current) => current === group.id ? '' : group.id)}
                  >
                    <span className="portal__navIcon"><GroupIcon /></span>
                    <span>{group.label}</span>
                    <span className="portal__navChevron" aria-hidden="true">⌄</span>
                  </button>
                  {expanded ? (
                    <div className="portal__navChildren">
                      {group.items.map(({ to, label, Icon }) => {
                        const ChildIcon = Icon;
                        const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
                        return (
                          <NavLink key={to} to={to} className={`portal__navItem portal__navItem--child ${active ? 'is-active' : ''}`}>
                            <span className="portal__navIcon"><ChildIcon /></span>
                            <span className="portal__navText">{label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </nav>
      )}

      {!navigationLocked ? (
        <div className="portal__sidebarUtility">
          {allowed(navigationHelp) ? (
            <NavLink to={navigationHelp.to} className="portal__utilityLink">
              <navigationHelp.Icon />
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
