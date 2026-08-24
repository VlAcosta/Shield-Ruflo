import React, { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccessControl } from '../../access';
import { INTEGRATION_STATUS_META } from '../model/integrationCatalog';
import { getProviderRuntime, hasIntegrationBackend } from '../../../services/integrations/integrationProviderRegistry';
import useIntegrationHub from '../hooks/useIntegrationHub';
import './IntegrationHubWorkspace.scss';

const STATUS_ORDER = ['error', 'expired', 'degraded', 'needs_setup', 'syncing', 'configured', 'connected', 'disconnected'];
const PROVIDER_SETUP = Object.freeze({
  wb: {
    note: 'Используется официальный WB API категории «Вопросы и отзывы». Токен хранится только в зашифрованном credential vault.',
    supportsScheduledSync: true,
    fields: [
      { key: 'apiToken', target: 'credentials', label: 'WB API token', placeholder: 'Токен категории «Вопросы и отзывы»', secret: true, required: true },
    ],
  },
  ozon: {
    note: 'Используется Ozon Seller API. Client ID и API key сохраняются зашифрованно и не возвращаются в браузер.',
    supportsScheduledSync: true,
    fields: [
      { key: 'clientId', target: 'credentials', label: 'Ozon Client ID', placeholder: 'Client ID продавца', required: true },
      { key: 'apiKey', target: 'credentials', label: 'Ozon API key', placeholder: 'API key Seller API', secret: true, required: true },
    ],
  },
  gis: {
    note: 'Официальный Places API 2GIS предоставляет карточку и статистику отзывов, но не текст отзывов. Поэтому автоматический импорт текстов отключён честно.',
    supportsScheduledSync: false,
    fields: [
      { key: 'apiKey', target: 'credentials', label: '2GIS API key', placeholder: 'Ключ Places API', secret: true, required: true },
    ],
  },
  yandex: {
    note: 'Публичного review API Яндекс Бизнес нет. Подключение выполняется только через ваш verified bridge/партнёрский шлюз; HTML-скрейпинг не используется.',
    supportsScheduledSync: true,
    fields: [
      { key: 'bridgeBaseUrl', target: 'configuration', label: 'Bridge URL', placeholder: 'https://bridge.example.ru', required: true },
      { key: 'bridgeToken', target: 'credentials', label: 'Bridge token', placeholder: 'Bearer token', secret: true, required: true },
    ],
  },
  otzovik: {
    note: 'Подключение выполняется через verified bridge с контрактом Business Shield. Неавторизованный скрейпинг публичных страниц не используется.',
    supportsScheduledSync: true,
    fields: [
      { key: 'bridgeBaseUrl', target: 'configuration', label: 'Bridge URL', placeholder: 'https://bridge.example.ru', required: true },
      { key: 'bridgeToken', target: 'credentials', label: 'Bridge token', placeholder: 'Bearer token', secret: true, required: true },
    ],
  },
});

function formatRelative(value) {
  if (!value) return 'ещё не запускалась';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'нет данных';
  const diff = Math.max(0, Date.now() - time);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин. назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(time));
}

function ProviderMark({ integration }) {
  return <span className={`integration-provider-mark is-${integration.tone || 'violet'}`}>{String(integration.shortName || integration.name).slice(0, 2).toUpperCase()}</span>;
}

function StatusBadge({ status }) {
  const meta = INTEGRATION_STATUS_META[status] || INTEGRATION_STATUS_META.disconnected;
  return <span className={`integration-status is-${meta.tone}`}><i />{meta.label}</span>;
}

function CapabilityList({ providerId }) {
  const runtime = getProviderRuntime(providerId);
  const labels = {
    'reviews.read': 'Импорт отзывов',
    'rating.read': 'Рейтинг',
    'replies.write': 'Публикация ответов',
    'accounts.read': 'Аккаунты',
    'locations.read': 'Карточки организаций',
    'profile.read': 'Профиль и статистика',
    'marketplace.read': 'Маркетплейс',
    'notifications.write': 'Уведомления',
    'crm.read': 'Данные CRM',
    'crm.write': 'Запись в CRM',
  };
  return <div className="integration-capabilities"><small>Фактические возможности</small>{runtime.capabilities.map((item) => <span key={item}>{labels[item] || item}</span>)}</div>;
}

function ConnectionModal({ integration, open, busy, onClose, onSave }) {
  const [link, setLink] = useState('');
  const [fields, setFields] = useState({});
  const [autoSync, setAutoSync] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const setup = PROVIDER_SETUP[integration?.id] || null;

  useEffect(() => {
    if (!open) return;
    setLink(integration?.link || '');
    setFields({});
    setAutoSync(integration?.syncPolicy?.enabled ?? setup?.supportsScheduledSync ?? false);
    setIntervalMinutes(integration?.syncPolicy?.intervalMinutes || 30);
  }, [integration?.id, integration?.link, integration?.syncPolicy?.enabled, integration?.syncPolicy?.intervalMinutes, open, setup?.supportsScheduledSync]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, open]);

  if (!open || !integration || typeof document === 'undefined') return null;
  const providerReady = hasIntegrationBackend();
  const submit = () => {
    const configuration = {};
    const credentials = {};
    (setup?.fields || []).forEach((field) => {
      const value = String(fields[field.key] || '').trim();
      if (!value) return;
      if (field.target === 'credentials') credentials[field.key] = value;
      else configuration[field.key] = value;
    });
    onSave({
      link,
      configuration,
      credentials,
      ...(setup?.supportsScheduledSync ? {
        syncPolicy: {
          enabled: autoSync,
          intervalMinutes: Math.max(5, Math.min(1440, Number(intervalMinutes) || 30)),
        },
      } : {}),
    });
  };

  return createPortal(
    <div className="integration-connect-modal">
      <button className="integration-connect-modal__backdrop" type="button" aria-label="Закрыть" onClick={onClose} />
      <section className="integration-connect-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="integration-connect-title">
        <header>
          <ProviderMark integration={integration} />
          <div><span>ПОДКЛЮЧЕНИЕ ИСТОЧНИКА</span><h2 id="integration-connect-title">{integration.name}</h2><p>{integration.description}</p></div>
          <button type="button" className="integration-connect-modal__close" onClick={onClose}>×</button>
        </header>
        <div className="integration-connect-modal__body">
          <label><span>Ссылка или идентификатор</span><input autoFocus value={link} onChange={(event) => setLink(event.target.value)} placeholder={integration.placeholder || 'https://...'} /></label>
          {(setup?.fields || []).map((field) => <label key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span><input type={field.secret ? 'password' : 'text'} autoComplete="off" value={fields[field.key] || ''} onChange={(event) => setFields((state) => ({ ...state, [field.key]: event.target.value }))} placeholder={field.placeholder} /></label>)}
          {setup?.note ? <div className="integration-connect-modal__truth"><strong>Источник данных</strong><span>{setup.note}</span></div> : null}
          {setup?.supportsScheduledSync ? <div className="integration-connect-modal__sync-policy"><label><input type="checkbox" checked={autoSync} onChange={(event) => setAutoSync(event.target.checked)} /><span>Автоматическая синхронизация</span></label><label><span>Интервал, минут</span><input type="number" min="5" max="1440" step="5" value={intervalMinutes} onChange={(event) => setIntervalMinutes(event.target.value)} disabled={!autoSync} /></label></div> : null}
          <div className={`integration-connect-modal__provider ${providerReady ? 'is-ready' : 'is-pending'}`}>
            <i />
            <div><strong>{providerReady ? 'Provider backend подключён' : 'Provider API ещё не выбран'}</strong><span>{providerReady ? 'Секреты отправляются только backend и сохраняются в зашифрованном credential vault. В браузер они не возвращаются.' : 'Сейчас мы сохраняем конфигурацию источника. Реальный импорт не имитируется.'}</span></div>
          </div>
          <CapabilityList providerId={integration.id} />
        </div>
        <footer><button type="button" onClick={onClose}>Отмена</button><button type="button" className="is-primary" disabled={Boolean(busy)} onClick={submit}>{busy ? 'Проверяем доступ…' : providerReady ? 'Проверить и подключить' : 'Сохранить конфигурацию'}</button></footer>
      </section>
    </div>,
    document.body,
  );
}

function DiagnosticsPanel({ integration, diagnostics, busy, canManage, onRun }) {
  const checks = diagnostics?.checks || integration.diagnostics?.checks || [];
  return <div className="integration-diagnostics">
    <div className="integration-diagnostics__head"><div><span>DIAGNOSTICS</span><strong>Проверка канала</strong></div>{canManage ? <button type="button" disabled={Boolean(busy)} onClick={onRun}>{busy === 'diagnostics' ? 'Проверяем…' : 'Запустить'}</button> : null}</div>
    {checks.length ? <div className="integration-diagnostics__checks">{checks.map((check) => <div key={check.id} className={check.pending ? 'is-pending' : check.ok ? 'is-ok' : 'is-error'}><i>{check.pending ? '…' : check.ok ? '✓' : '!'}</i><span>{check.label}</span></div>)}</div> : <p>Диагностика ещё не запускалась. Она проверит конфигурацию и состояние provider-канала, не создавая новых данных.</p>}
  </div>;
}

function ProviderInspector({ integration, busy, canManage, onConfigure, onSync, onReconnect, onDisconnect, onDiagnose }) {
  const [diagnostics, setDiagnostics] = useState(null);
  useEffect(() => { setDiagnostics(null); }, [integration?.id]);
  if (!integration) return <aside className="integration-inspector is-empty"><div><span>INTEGRATION INSPECTOR</span><strong>Выберите источник</strong><p>Здесь появятся состояние подключения, диагностика и история синхронизации.</p></div></aside>;
  const meta = INTEGRATION_STATUS_META[integration.status] || INTEGRATION_STATUS_META.disconnected;
  const remoteReady = integration.providerMode === 'backend';
  const handleDiagnose = async () => {
    try { setDiagnostics(await onDiagnose(integration.id)); } catch { return; }
  };
  return <aside className={`integration-inspector is-${integration.tone || 'violet'}`}>
    <div className="integration-inspector__hero">
      <ProviderMark integration={integration} />
      <div><span>{integration.category}</span><h2>{integration.name}</h2><StatusBadge status={integration.status} /></div>
    </div>
    <p className="integration-inspector__description">{integration.description}</p>
    <div className="integration-inspector__facts">
      <div><span>Последняя синхронизация</span><strong>{formatRelative(integration.lastSyncAt)}</strong></div>
      <div><span>Канал</span><strong>{remoteReady ? 'Backend provider' : 'Ожидает provider API'}</strong></div>
      <div><span>Источник</span><strong>{integration.link ? 'Идентификатор задан' : 'Не настроен'}</strong></div>
      <div><span>Состояние</span><strong>{meta.label}</strong></div>
      {integration.lastSyncStats?.reviews !== undefined ? <div><span>Последний импорт</span><strong>{integration.lastSyncStats.reviews} отзывов</strong></div> : null}
      {integration.syncPolicy ? <div><span>Автосинхронизация</span><strong>{integration.syncPolicy.enabled ? `каждые ${integration.syncPolicy.intervalMinutes} мин.` : 'выключена'}</strong></div> : null}
      {integration.nextSyncAt ? <div><span>Следующий sync</span><strong>{formatRelative(integration.nextSyncAt)}</strong></div> : null}
    </div>
    {integration.lastError ? <div className="integration-inspector__error"><i>!</i><div><strong>Последняя ошибка</strong><span>{integration.lastError}</span></div></div> : null}
    <CapabilityList providerId={integration.id} />
    <DiagnosticsPanel integration={integration} diagnostics={diagnostics} busy={busy} canManage={canManage} onRun={handleDiagnose} />
    {integration.authorizationUrl ? <a className="integration-inspector__authorize" href={integration.authorizationUrl}>Продолжить авторизацию →</a> : null}
    {canManage ? <div className="integration-inspector__actions">
      {!integration.enabled || integration.status === 'needs_setup' || integration.status === 'disconnected' ? <button type="button" className="is-primary" onClick={onConfigure}>Настроить источник</button> : null}
      {integration.enabled && ['expired', 'error', 'degraded'].includes(integration.status) ? <button type="button" className="is-primary" disabled={Boolean(busy)} onClick={() => onReconnect(integration.id)}>{busy === 'reconnect' ? 'Восстанавливаем…' : 'Переподключить'}</button> : null}
      {integration.enabled ? <button type="button" disabled={Boolean(busy) || !remoteReady} title={!remoteReady ? 'Доступно после подключения provider backend' : ''} onClick={() => onSync(integration.id)}>{busy === 'sync' ? 'Синхронизация…' : 'Синхронизировать'}</button> : null}
      {integration.enabled ? <button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => onDisconnect(integration.id)}>Отключить</button> : null}
    </div> : null}
  </aside>;
}

function ActivityFeed({ items }) {
  return <section className="integration-activity"><header><div><span>ACTIVITY LOG</span><h2>Журнал подключений</h2></div><small>Только фактические действия и диагностика</small></header>{items.length ? <div className="integration-activity__list">{items.slice(0, 12).map((item, index) => <article className={`is-${item.level || 'info'}`} key={item.id} style={{ '--activity-index': index }}><i>{item.level === 'success' ? '✓' : item.level === 'error' ? '!' : '•'}</i><div><strong>{item.providerName || item.providerId}</strong><p>{item.message || item.action}</p><span>{formatRelative(item.createdAt)}</span></div></article>)}</div> : <div className="integration-activity__empty"><span>LOG</span><strong>Журнал пока пуст</strong><p>После настройки, диагностики или синхронизации здесь появится история действий.</p></div>}</section>;
}

function ProviderCard({ integration, selected, busy, canManage, onSelect, onConfigure, onSync }) {
  const meta = INTEGRATION_STATUS_META[integration.status] || INTEGRATION_STATUS_META.disconnected;
  const canSync = integration.enabled && integration.providerMode === 'backend' && ['connected', 'configured', 'degraded'].includes(integration.status) && getProviderRuntime(integration.id).capabilities.includes('reviews.read');
  return <article className={`integration-provider-card is-${integration.tone || 'violet'} ${selected ? 'is-selected' : ''}`}>
    <button type="button" className="integration-provider-card__main" onClick={onSelect}>
      <div className="integration-provider-card__head"><ProviderMark integration={integration} /><StatusBadge status={integration.status} /></div>
      <div className="integration-provider-card__copy"><span>{integration.category}</span><h3>{integration.name}</h3><p>{integration.description}</p></div>
      <div className="integration-provider-card__meta"><span><i className={integration.link ? 'is-ok' : ''} />{integration.link ? 'Идентификатор задан' : 'Требуется идентификатор'}</span><span>Sync: {formatRelative(integration.lastSyncAt)}</span></div>
    </button>
    {canManage ? <div className="integration-provider-card__actions">
      <button type="button" onClick={onConfigure}>{integration.enabled ? 'Настроить' : 'Подключить'}</button>
      <button type="button" disabled={!canSync || Boolean(busy)} onClick={onSync}>{busy === 'sync' ? 'Sync…' : 'Синхронизировать'}</button>
      <span className={`is-${meta.tone}`}>{meta.shortLabel}</span>
    </div> : null}
  </article>;
}

function IntegrationHubWorkspace() {
  const hub = useIntegrationHub();
  const access = useAccessControl();
  const canManage = access.can('integrations.manage');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(() => hub.connections.find((item) => item.enabled)?.id || 'yandex');
  const [connectId, setConnectId] = useState(null);

  const selected = hub.connections.find((item) => item.id === selectedId) || hub.connections[0] || null;
  const connectTarget = hub.connections.find((item) => item.id === connectId) || null;
  const backendReady = hasIntegrationBackend();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...hub.connections]
      .filter((item) => {
        if (filter === 'active') return item.enabled;
        if (filter === 'issues') return item.enabled && ['error', 'expired', 'degraded', 'needs_setup'].includes(item.status);
        if (filter === 'recommended') return item.recommended;
        return true;
      })
      .filter((item) => !q || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const sa = STATUS_ORDER.indexOf(a.status); const sb = STATUS_ORDER.indexOf(b.status);
        return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb);
      });
  }, [filter, hub.connections, query]);

  const saveConnection = async (payload) => {
    if (!connectTarget) return;
    try {
      await hub.configure(connectTarget.id, payload);
      setConnectId(null);
      setSelectedId(connectTarget.id);
    } catch { return; }
  };

  return <div className="integration-hub-page">
    <section className="integration-hub-hero">
      <div className="integration-hub-hero__copy"><span className="integration-hub-eyebrow"><i /> INTEGRATION OPERATIONS</span><h1>Все источники.<br/><em>Один контрольный центр.</em></h1><p>Подключения, синхронизация и диагностика Яндекс, 2GIS, Ozon, Отзовика и Wildberries — без скрытой имитации provider API.</p><div className="integration-hub-hero__actions">{canManage ? <button type="button" onClick={() => setConnectId(hub.connections.find((item) => !item.enabled)?.id || selectedId)}>+ Подключить источник</button> : null}<button type="button" className="is-secondary" onClick={hub.refresh}>Обновить состояние</button></div></div>
      <div className="integration-health-orbit" aria-label={`Состояние подключений ${hub.metrics.score}%`}><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="68" pathLength="100" className="integration-health-orbit__track"/><circle cx="90" cy="90" r="68" pathLength="100" strokeDasharray={`${hub.metrics.score} 100`} className="integration-health-orbit__value"/></svg><div><strong>{hub.metrics.score}%</strong><span>готовность</span></div><i className="is-one"/><i className="is-two"/><b>{backendReady ? 'PROVIDER LIVE' : 'PROVIDER READY'}</b></div>
    </section>

    <section className="integration-hub-kpis">
      <article><span>Активно</span><strong>{hub.metrics.enabled}</strong><small>источников выбрано</small></article>
      <article><span>Подключено</span><strong>{hub.metrics.connected}</strong><small>подтверждено backend</small></article>
      <article><span>Настроено</span><strong>{hub.metrics.configured}</strong><small>ожидает provider API</small></article>
      <article className={hub.metrics.issues ? 'is-alert' : ''}><span>Требуют внимания</span><strong>{hub.metrics.issues}</strong><small>{hub.metrics.issues ? 'нужна проверка' : 'ошибок нет'}</small></article>
    </section>

    {hub.error ? <div className="integration-hub-message is-error"><span>{hub.error}</span><button type="button" onClick={hub.clearError}>×</button></div> : null}

    <div className="integration-command-bar">
      <div className="integration-command-bar__filters">{[['all','Все'],['active','Активные'],['issues','С ошибками'],['recommended','Рекомендуемые']].map(([value,label]) => <button type="button" className={filter === value ? 'is-active' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      <label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти источник…" /></label>
    </div>

    <div className="integration-hub-layout">
      <section className="integration-provider-grid">{visible.map((integration) => <ProviderCard key={integration.id} integration={integration} selected={selected?.id === integration.id} busy={hub.busy[integration.id]} canManage={canManage} onSelect={() => setSelectedId(integration.id)} onConfigure={() => setConnectId(integration.id)} onSync={(event) => { event.stopPropagation(); hub.sync(integration.id); }} />)}{!visible.length ? <div className="integration-provider-grid__empty"><span>0</span><strong>Источники не найдены</strong><p>Измените фильтр или поисковый запрос.</p></div> : null}</section>
      <ProviderInspector integration={selected} busy={selected ? hub.busy[selected.id] : null} canManage={canManage} onConfigure={() => selected && setConnectId(selected.id)} onSync={hub.sync} onReconnect={hub.reconnect} onDisconnect={hub.disconnect} onDiagnose={hub.diagnose} />
    </div>

    <ActivityFeed items={hub.activity} />
    <ConnectionModal integration={connectTarget} open={Boolean(connectTarget)} busy={connectTarget ? hub.busy[connectTarget.id] : null} onClose={() => setConnectId(null)} onSave={saveConnection} />
  </div>;
}

export default memo(IntegrationHubWorkspace);
