import React, { memo } from 'react';
import './DashboardWidgetState.scss';

function RefreshIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15.4 7A6 6 0 1 0 16 12.4M15.4 7V3.8M15.4 7H12.2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DashboardWidgetState({ type = 'empty', title, text, onRetry, compact = false }) {
  if (type === 'loading') {
    return <div className={`dashboard-widget-state is-loading ${compact ? 'is-compact' : ''}`} aria-busy="true" aria-label="Загрузка данных"><i/><i/><i/><span/></div>;
  }
  return (
    <div className={`dashboard-widget-state is-${type} ${compact ? 'is-compact' : ''}`} role={type === 'error' ? 'alert' : 'status'}>
      <span className="dashboard-widget-state__mark" aria-hidden="true">{type === 'error' ? '!' : type === 'offline' ? '↯' : '·'}</span>
      <div><strong>{title || (type === 'error' ? 'Не удалось загрузить данные' : 'Пока нет данных')}</strong><p>{text || 'Как только появятся данные, блок заполнится автоматически.'}</p></div>
      {onRetry ? <button type="button" onClick={onRetry}><RefreshIcon/>Повторить</button> : null}
    </div>
  );
}

export default memo(DashboardWidgetState);
