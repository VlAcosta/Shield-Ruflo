import React, { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import EmptyState from '../../../components/ui/EmptyState';
import { INTEGRATION_STATUS_META, useConnectedIntegrations } from '../../integrations';
import useAccessControl from '../../access/hooks/useAccessControl';
import './Integrations.scss';

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 11L11 5M7 5h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 6.3A2.7 2.7 0 1 0 9 11.7 2.7 2.7 0 0 0 9 6.3Z" stroke="currentColor" strokeWidth="1.35"/><path d="M14.2 10.8l1.1.8-1.5 2.6-1.3-.5a6 6 0 0 1-1.6.9l-.2 1.4h-3l-.2-1.4a6 6 0 0 1-1.6-.9l-1.3.5-1.5-2.6 1.1-.8a6 6 0 0 1 0-1.8l-1.1-.8 1.5-2.6 1.3.5a6 6 0 0 1 1.6-.9l.2-1.4h3l.2 1.4a6 6 0 0 1 1.6.9l1.3-.5 1.5 2.6-1.1.8a6 6 0 0 1 0 1.8Z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round"/></svg>;
}

function IntegrationRow({ integration, onOpen }) {
  const status = INTEGRATION_STATUS_META[integration.status] || INTEGRATION_STATUS_META.disconnected;
  const healthy = ['connected', 'configured', 'syncing'].includes(integration.status);
  return <button type="button" className="dashboard-integrations__item" onClick={onOpen}>
    <span className={`dashboard-integrations__mark is-${integration.tone || 'violet'}`}>{String(integration.shortName || integration.name || integration.id).slice(0, 2).toUpperCase()}</span>
    <span className="dashboard-integrations__copy"><strong>{integration.name || integration.id}</strong><small>{integration.category || 'Интеграция'} · {integration.lastSyncAt ? 'синхронизация была' : integration.link ? 'источник настроен' : 'требуется настройка'}</small></span>
    <span className={`dashboard-integrations__state ${healthy ? 'is-ready' : 'is-pending'}`}><i />{status.shortLabel}</span>
    <span className="dashboard-integrations__arrow"><ArrowIcon /></span>
  </button>;
}

function Integrations() {
  const navigate = useNavigate();
  const access = useAccessControl();
  const integrations = useConnectedIntegrations();
  const canManage = access.can('integrations.manage');
  const healthyCount = useMemo(() => integrations.filter((item) => ['connected', 'configured', 'syncing'].includes(item.status)).length, [integrations]);
  const issueCount = useMemo(() => integrations.filter((item) => ['error', 'expired', 'degraded', 'needs_setup'].includes(item.status)).length, [integrations]);
  const health = integrations.length ? Math.round((healthyCount / integrations.length) * 100) : 0;
  const openSettings = () => navigate('/profile?tab=integrations');

  return <DashboardCard title="Интеграции" eyebrow="Provider hub" className="dashboard-integrations" motion="scale" action={<button type="button" className="dashboard-integrations__settings" onClick={openSettings}><SettingsIcon /><span>{canManage ? 'Настройки' : 'Открыть'}</span></button>}>
    {integrations.length ? <>
      <div className="dashboard-integrations__health">
        <div><span>Состояние подключений</span><strong>{health}%</strong><small>{healthyCount} из {integrations.length} источников готовы</small></div>
        <div className="dashboard-integrations__health-bar"><i style={{ width: `${health}%` }} /></div>
        <span className={`dashboard-integrations__live ${issueCount ? 'is-warning' : ''}`}><i />{issueCount ? `${issueCount} требуют внимания` : 'каналы в норме'}</span>
      </div>
      <div className="dashboard-integrations__list">{integrations.slice(0, 5).map((integration) => <IntegrationRow integration={integration} key={integration.id} onOpen={openSettings} />)}</div>
      <button type="button" className="dashboard-integrations__more" onClick={openSettings}>{integrations.length > 5 ? `Ещё ${integrations.length - 5} подключения` : canManage ? 'Диагностика и синхронизация' : 'Посмотреть подключения'} →</button>
    </> : <button type="button" className="dashboard-integrations__empty-action" onClick={openSettings}><EmptyState title="Интеграции не подключены" text={canManage ? 'Откройте настройки профиля, выберите источники и настройте безопасный provider-канал.' : 'Подключения появятся здесь после настройки пользователем с соответствующим доступом.'} /><span>{canManage ? 'Открыть настройки интеграций' : 'Открыть интеграции'} →</span></button>}
  </DashboardCard>;
}
export default memo(Integrations);
