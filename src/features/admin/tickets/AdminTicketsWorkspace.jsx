import React, { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TicketDetailsPanel from './components/TicketDetailsPanel';
import TicketQueueItem from './components/TicketQueueItem';
import useAdminTickets from './hooks/useAdminTickets';
import { getPriorityMeta, TICKET_PRIORITY_OPTIONS, TICKET_STATUS_OPTIONS } from './model/adminTicketsData';
import './AdminTicketsWorkspace.scss';

function Metric({ label, value, hint, tone, icon, index }) {
  return <article className={`admin-ticket-metric is-${tone}`} style={{ '--metric-index': index }}><span>{label}<i>{icon}</i></span><strong>{value}</strong><small>{hint}</small><b aria-hidden="true" /></article>;
}

function Skeleton() {
  return <div className="admin-tickets-skeleton"><i className="is-intro"/><div>{Array.from({length:4}).map((_,i)=><i key={i}/>)}</div><section><aside>{Array.from({length:6}).map((_,i)=><i key={i}/>)}</aside><main><i/><i/><i/></main></section></div>;
}

function AdminTicketsWorkspace({ onRefreshReady }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tickets, managers, metrics, loading, saving, error, refresh, patchTicket, sendMessage, assignManager } = useAdminTickets();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [status, setStatus] = useState('active');
  const [priority, setPriority] = useState('all');
  const selectedId = searchParams.get('ticket');

  useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);

  const filtered = useMemo(() => {
    const source = tickets || [];
    const result = source.filter((ticket) => {
      const haystack = `${ticket.id} ${ticket.subject} ${ticket.clientName} ${ticket.category} ${ticket.assignedManagerName}`.toLowerCase();
      const queryOk = !deferredQuery || haystack.includes(deferredQuery);
      const statusOk = status === 'all' || (status === 'active' ? ticket.status !== 'closed' : ticket.status === status);
      const priorityOk = priority === 'all' || ticket.priority === priority;
      return queryOk && statusOk && priorityOk;
    });
    return result.sort((a,b) => {
      if (a.status === 'closed' && b.status !== 'closed') return 1;
      if (a.status !== 'closed' && b.status === 'closed') return -1;
      return getPriorityMeta(b.priority).weight - getPriorityMeta(a.priority).weight || Number(b.id) - Number(a.id);
    });
  }, [tickets, deferredQuery, status, priority]);

  useEffect(() => {
    if (!tickets?.length) return;
    if (selectedId && filtered.some((ticket) => ticket.id === selectedId)) return;
    const first = filtered[0] || tickets[0];
    if (first) setSearchParams({ ticket: first.id }, { replace: true });
  }, [tickets, filtered, selectedId, setSearchParams]);

  const selected = tickets?.find((ticket) => ticket.id === selectedId) || null;

  const selectTicket = (ticketId) => {
    setSearchParams({ ticket: ticketId });
    const ticket = tickets?.find((item) => item.id === ticketId);
    if (ticket?.unread) patchTicket(ticketId, { unread: 0 });
  };

  if (loading && !tickets) return <Skeleton />;
  if (error && !tickets) return <section className="admin-tickets-error"><span>!</span><strong>Не удалось загрузить поддержку</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;

  return (
    <div className="admin-tickets">
      <section className="admin-tickets__intro">
        <div><span>SUPPORT OPERATIONS</span><h2>Центр поддержки</h2><p>Очередь обращений, SLA и переписка с клиентами в одном рабочем пространстве.</p></div>
        <div className="admin-tickets__pulse"><i><b /></i><span><strong>{metrics.unread || '0'}</strong><small>непрочитанных сообщений</small></span></div>
      </section>

      <div className="admin-tickets__metrics">
        <Metric label="Открытых" value={metrics.open} hint="требуют ответа" tone="red" icon="↗" index={0}/>
        <Metric label="В обработке" value={metrics.inProgress} hint="команда работает" tone="orange" icon="◷" index={1}/>
        <Metric label="Высокий приоритет" value={metrics.highPriority} hint={`${metrics.slaRisk} рискуют по SLA`} tone="violet" icon="!" index={2}/>
        <Metric label="Закрыто за мес." value={metrics.closedMonth} hint="решённые обращения" tone="green" icon="✓" index={3}/>
      </div>

      <section className="admin-ticket-desk">
        <aside className="admin-ticket-queue">
          <header>
            <div><span>LIVE QUEUE</span><h3>Очередь</h3></div>
            <strong>{filtered.length}<small> тикетов</small></strong>
          </header>
          <div className="admin-ticket-queue__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Клиент, тема или #тикет…" /></div>
          <div className="admin-ticket-queue__filters">
            <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Активные</option><option value="all">Все статусы</option>{TICKET_STATUS_OPTIONS.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Любой приоритет</option>{TICKET_PRIORITY_OPTIONS.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select>
          </div>
          <div className="admin-ticket-queue__list">
            {filtered.length ? filtered.map((ticket,index)=><TicketQueueItem key={ticket.id} ticket={ticket} selected={ticket.id===selectedId} index={index} onSelect={selectTicket}/>) : <div className="admin-ticket-queue__empty"><span>⌕</span><strong>Ничего не найдено</strong><p>Измените запрос или фильтры.</p></div>}
          </div>
        </aside>

        <div className="admin-ticket-desk__detail">
          <TicketDetailsPanel
            ticket={selected}
            managers={managers}
            saving={saving}
            onPatch={(patch) => patchTicket(selected.id, patch)}
            onAssign={(managerId) => assignManager(selected.id, managerId)}
            onSend={(payload) => sendMessage(selected.id, payload)}
            onOpenClient={(clientId) => navigate(`/admin/clients/${clientId}`)}
          />
        </div>
      </section>
    </div>
  );
}

export default memo(AdminTicketsWorkspace);
