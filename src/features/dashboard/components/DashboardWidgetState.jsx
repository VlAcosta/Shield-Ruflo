import React, { memo } from 'react';
import './DashboardWidgetState.scss';

function RefreshIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15.4 7A6 6 0 1 0 16 12.4M15.4 7V3.8M15.4 7H12.2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 10H15.5M11.5 6L15.5 10L11.5 14" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DashboardWidgetState({
  type = 'empty',
  title,
  text,
  onRetry,
  actionLabel,
  onAction,
  compact = false,
}) {
  if (type === 'loading') {
    return <div className={`dashboard-widget-state is-loading ${compact ? 'is-compact' : ''}`} aria-busy="true" aria-label="Загрузка данных"><i/><i/><i/><span/></div>;
  }

  return (
    <div className={`dashboard-widget-state is-${type} ${compact ? 'is-compact' : ''}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="dashboard-widget-state__mark" aria-hidden="true">{type === 'error' ? '!' : type === 'offline' ? '↯' : '·'}</span>
      <div className="dashboard-widget-state__copy">
        <strong>{title || (type === 'error' ? 'Не удалось загрузить данные' : 'Пока нет данных')}</strong>
        <p>{text || 'Как только появятся данные, блок заполнится автоматически.'}</p>
      </div>
      <div className="dashboard-widget-state__actions">
        {onRetry ? <button type="button" onClick={onRetry}><RefreshIcon/>Повторить</button> : null}
        {actionLabel && onAction ? <button className="is-primary" type="button" onClick={onAction}>{actionLabel}<ArrowIcon/></button> : null}
      </div>
    </div>
  );
}

export default memo(DashboardWidgetState);
