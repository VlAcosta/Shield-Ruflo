import React, { memo, useEffect, useMemo, useState } from 'react';
import ManagerDetailsPanel from './components/ManagerDetailsPanel';
import ManagerFormModal from './components/ManagerFormModal';
import ManagerList from './components/ManagerList';
import useAdminManagers from './hooks/useAdminManagers';
import './AdminManagersWorkspace.scss';

function ManagerMetric({ label, value, hint, tone, index }) {
  return (
    <article className={`admin-manager-metric is-${tone}`} style={{ '--metric-index': index }}>
      <div><span>{label}</span><i /></div>
      <strong>{value}</strong>
      <small>{hint}</small>
      <b aria-hidden="true" />
    </article>
  );
}

function Skeleton() {
  return (
    <div className="admin-managers-skeleton">
      <i className="is-intro" />
      <div>{Array.from({ length: 4 }).map((_, index) => <i key={index} />)}</div>
      <section><i /><i /></section>
    </div>
  );
}

function AdminManagersWorkspace({ onRefreshReady }) {
  const {
    managers,
    clients,
    metrics,
    loading,
    saving,
    error,
    refresh,
    createManager,
    updateManager,
    assignClient,
  } = useAdminManagers();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [modal, setModal] = useState({ open: false, manager: null });
  const [toast, setToast] = useState('');

  useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);
  useEffect(() => {
    if (!selectedId && managers?.length) setSelectedId(managers[0].id);
  }, [managers, selectedId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredManagers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (managers || []).filter((manager) => {
      const matchesStatus = status === 'all' || manager.status === status;
      const haystack = `${manager.name} ${manager.email} ${manager.phone} ${manager.role}`.toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [managers, query, status]);

  const selectedManager = useMemo(() => {
    return (managers || []).find((manager) => manager.id === selectedId) || filteredManagers[0] || managers?.[0] || null;
  }, [managers, filteredManagers, selectedId]);

  const handleCreate = async (payload) => {
    const created = await createManager(payload);
    setModal({ open: false, manager: null });
    setSelectedId(created.id);
    setToast('Менеджер добавлен в команду');
  };

  const handleUpdate = async (payload) => {
    if (!modal.manager) return;
    await updateManager(modal.manager.id, payload);
    setModal({ open: false, manager: null });
    setToast('Профиль менеджера обновлён');
  };

  const handleAssign = async (clientId, managerId) => {
    await assignClient(clientId, managerId);
    setToast('Клиент переназначен');
  };

  if (loading && !managers) return <Skeleton />;
  if (error && !managers) return <section className="admin-managers-error"><strong>Не удалось загрузить команду</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;

  const avgRating = metrics.rating ? metrics.rating.toFixed(1) : '—';

  return (
    <div className="admin-managers-page">
      <section className="admin-managers-intro">
        <div>
          <span>TEAM OPERATIONS</span>
          <h2>Команда поддержки и сопровождения</h2>
          <p>Контролируйте загрузку менеджеров, клиентские портфели и качество сервиса в одном рабочем пространстве.</p>
        </div>
        <div className="admin-managers-intro__pulse">
          <i><b style={{ '--pulse': `${Math.round((metrics.active / Math.max(1, metrics.total)) * 100)}%` }} /></i>
          <span><strong>{metrics.active}/{metrics.total}</strong><small>в активной работе</small></span>
        </div>
      </section>

      <div className="admin-manager-metrics">
        <ManagerMetric label="Всего менеджеров" value={metrics.total} hint="команда" tone="violet" index={0} />
        <ManagerMetric label="Активных" value={metrics.active} hint="сейчас в работе" tone="green" index={1} />
        <ManagerMetric label="Средний рейтинг" value={avgRating} hint="качество сервиса" tone="purple" index={2} />
        <ManagerMetric label="Общая выручка" value={`${metrics.revenue.toLocaleString('ru-RU')} ₽`} hint={`${metrics.tickets} открытых тикетов`} tone="orange" index={3} />
      </div>

      <section className="admin-managers-toolbar">
        <div className="admin-managers-toolbar__meta"><span>КОМАНДА</span><b>{filteredManagers.length}</b><small>в выборке</small></div>
        <label className="admin-managers-toolbar__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, email, роль…" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="training">Обучение</option>
          <option value="paused">Приостановлены</option>
        </select>
        <button className="admin-managers-toolbar__add" type="button" onClick={() => setModal({ open: true, manager: null })}>+ Добавить менеджера</button>
      </section>

      <div className="admin-managers-layout">
        <div className="admin-managers-layout__list">
          <header><div><span>СОСТАВ</span><h2>Менеджеры</h2></div><small>{filteredManagers.length} профилей</small></header>
          {filteredManagers.length ? (
            <ManagerList managers={filteredManagers} selectedId={selectedManager?.id} onSelect={setSelectedId} />
          ) : (
            <div className="admin-managers-empty"><strong>Ничего не найдено</strong><p>Измените запрос или фильтр статуса.</p></div>
          )}
        </div>

        {selectedManager ? (
          <ManagerDetailsPanel
            manager={selectedManager}
            allClients={clients}
            saving={saving}
            onEdit={() => setModal({ open: true, manager: selectedManager })}
            onAssignClient={handleAssign}
          />
        ) : null}
      </div>

      {toast ? <div className="admin-managers-toast"><i />{toast}</div> : null}

      <ManagerFormModal
        open={modal.open}
        manager={modal.manager}
        saving={saving}
        onClose={() => setModal({ open: false, manager: null })}
        onSubmit={modal.manager ? handleUpdate : handleCreate}
      />
    </div>
  );
}

export default memo(AdminManagersWorkspace);
