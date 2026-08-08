import React, { memo } from 'react';
import './DashboardCard.scss';

function DashboardCard({
  children,
  title,
  eyebrow,
  action,
  icon,
  className = '',
  bodyClassName = '',
  motion = 'rise',
  as: Component = 'section',
}) {
  const hasHeader = title || eyebrow || action || icon;

  return (
    <Component
      className={`dashboard-card dashboard-card--motion-${motion} ${className}`.trim()}
    >
      {hasHeader ? (
        <header className="dashboard-card__header">
          <div className="dashboard-card__heading">
            {icon ? <span className="dashboard-card__icon">{icon}</span> : null}
            <div>
              {eyebrow ? <span className="dashboard-card__eyebrow">{eyebrow}</span> : null}
              {title ? <h3 className="dashboard-card__title">{title}</h3> : null}
            </div>
          </div>
          {action ? <div className="dashboard-card__action">{action}</div> : null}
        </header>
      ) : null}

      <div className={`dashboard-card__body ${bodyClassName}`.trim()}>{children}</div>
    </Component>
  );
}

export default memo(DashboardCard);
