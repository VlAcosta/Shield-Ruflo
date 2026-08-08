import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { adminNavigation } from '../navigation';
import { LockIcon } from '../icons';
import BrandMark from '../../../components/brand/BrandMark';

export default function AdminSidebar({ onLock }) {
  const location = useLocation();

  return (
    <aside className="admin-shell__sidebar">
      <div className="admin-sidebar__brand">
        <BrandMark size={38} className="admin-sidebar__logoMark" />
        <div className="admin-sidebar__brand-copy">
          <strong>БИЗНЕС ЩИТ</strong>
          <small>CONTROL CENTER</small>
        </div>
        <span className="admin-sidebar__brand-badge">ADMIN</span>
      </div>

      <div className="admin-sidebar__role">
        <div>
          <span>УРОВЕНЬ ДОСТУПА</span>
          <strong>Суперадминистратор</strong>
        </div>
        <i className="admin-sidebar__role-status" title="Система доступна" />
      </div>

      <div className="admin-sidebar__section-label">УПРАВЛЕНИЕ</div>
      <nav className="admin-sidebar__nav" aria-label="Администрирование">
        {adminNavigation.map(({ id, to, label, Icon, badge, enabled }) => {
          const active = location.pathname === to
            || location.pathname.startsWith(`${to}/`)
            || (id === 'dashboard' && location.pathname === '/admin');

          if (!enabled) {
            return (
              <button
                key={id}
                type="button"
                className="admin-sidebar__item is-disabled"
                aria-disabled="true"
                title="Раздел будет подключён на следующем этапе"
              >
                <span className="admin-sidebar__item-icon"><Icon /></span>
                <span className="admin-sidebar__item-label">{label}</span>
                {badge ? <em>{badge}</em> : null}
              </button>
            );
          }

          return (
            <NavLink key={id} to={to} className={`admin-sidebar__item ${active ? 'is-active' : ''}`}>
              <span className="admin-sidebar__active-rail" aria-hidden="true" />
              <span className="admin-sidebar__item-icon"><Icon /></span>
              <span className="admin-sidebar__item-label">{label}</span>
              {badge ? <em>{badge}</em> : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="admin-sidebar__footer">
        <div className="admin-sidebar__system">
          <i />
          <span><strong>Все системы</strong><small>Работают штатно</small></span>
        </div>

        <div className="admin-sidebar__profile">
          <span>АД</span>
          <div><strong>Admin</strong><small>admin@biznesshield.ru</small></div>
          <i className="admin-sidebar__profile-online" />
        </div>

        <button type="button" className="admin-sidebar__lock" onClick={onLock}>
          <LockIcon /><span>Заблокировать кабинет</span>
        </button>
      </div>
    </aside>
  );
}
