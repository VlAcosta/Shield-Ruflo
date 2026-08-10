import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAdminSubscriptions from './hooks/useAdminSubscriptions';
import BillingMetricCard from './components/BillingMetricCard';
import BillingRevenueChart from './components/BillingRevenueChart';
import SubscriptionTable from './components/SubscriptionTable';
import PlanEditorModal from './components/PlanEditorModal';
import { formatAdminMoney } from './model/adminSubscriptionsData';
import './AdminSubscriptionsWorkspace.scss';

const tabs = [
  ['subscriptions', 'Подписки клиентов'],
  ['plans', 'Управление тарифами'],
  ['renewals', 'Продления'],
];

function Skeleton() {
  return <div className="admin-billing-skeleton">{Array.from({ length: 11 }).map((_, index) => <i key={index} />)}</div>;
}

export default function AdminSubscriptionsWorkspace({ onRefreshReady }) {
  const navigate = useNavigate();
  const { data, error, refreshing, saving, refresh, updatePlan, createPlan, toggleAutoRenew } = useAdminSubscriptions();
  const [tab, setTab] = useState('subscriptions');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [editor, setEditor] = useState({ open: false, plan: null });

  React.useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.subscriptions.filter((item) => {
      const matchQuery = !needle || `${item.clientName} ${item.planName} ${item.managerName || ''}`.toLowerCase().includes(needle);
      const matchStatus = status === 'all' || item.status === status;
      return matchQuery && matchStatus;
    });
  }, [data, query, status]);

  if (!data && refreshing) return <Skeleton />;
  if (!data && error) return <section className="admin-billing-error"><strong>Не удалось загрузить биллинг</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;
  if (!data) return null;

  const renewalRate = data.metrics.renewalRate;
  const metrics = [
    ['MRR', formatAdminMoney(data.metrics.mrr), 'текущий срез', 'violet', 'по активным подпискам'],
    ['ARR (расчёт)', formatAdminMoney(data.metrics.arr), 'MRR × 12', 'magenta', 'не история платежей'],
    ['Активных подписок', data.metrics.active, 'текущий срез', 'green', 'активны сейчас'],
    ['Автопродление', renewalRate === null ? '—' : `${renewalRate}%`, renewalRate === null ? 'нет данных' : 'текущий срез', 'cyan', 'по активным и пробным'],
  ];

  const savePlan = async (payload) => {
    if (editor.plan) await updatePlan(editor.plan.id, payload);
    else await createPlan(payload);
    setEditor({ open: false, plan: null });
  };

  return (
    <div className={`admin-billing ${refreshing ? 'is-refreshing' : ''}`}>
      <section className="admin-billing__intro">
        <div><span>BILLING CONTROL</span><h2>Доход и подписки без слепых зон</h2><p>Текущие показатели рассчитываются из реальных подписок. Платёжная история появится после подключения production payment provider.</p></div>
        <div className="admin-billing__pulse"><span><i />MRR</span><strong>{formatAdminMoney(data.metrics.mrr)}</strong><small>по активным подпискам в PostgreSQL</small></div>
      </section>

      <div className="admin-billing__metrics">{metrics.map(([label, value, delta, tone, caption], index) => <BillingMetricCard key={label} label={label} value={value} delta={delta} tone={tone} index={index} caption={caption} />)}</div>

      <div className="admin-billing__overview">
        <BillingRevenueChart configured={data.paymentHistoryConfigured} />
        <section className="admin-billing-card admin-billing-radar">
          <header><div><span>RENEWAL RADAR</span><h2>Риски продлений</h2><p>Срез по текущим подпискам и рейтингу организаций.</p></div><b>{data.metrics.atRisk}</b></header>
          <div className="admin-billing-radar__ring"><div style={{ '--risk': `${Math.min(100, data.metrics.atRisk * 18)}%` }}><strong>{data.metrics.atRisk}</strong><small>с рейтингом ниже 3.5</small></div></div>
          <div className="admin-billing-radar__stats"><span><b>{data.metrics.expiringSoon}</b><small>имеют дату продления</small></span><span><b>{data.metrics.manualRenewals}</b><small>без автопродления</small></span></div>
        </section>
      </div>

      <section className="admin-billing-card admin-billing-console">
        <header className="admin-billing-console__head">
          <div className="admin-billing-console__tabs">{tabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}{id === 'renewals' ? <em>{data.renewals.length}</em> : null}</button>)}</div>
          {tab === 'plans' ? <button type="button" className="admin-billing-console__primary" onClick={() => setEditor({ open: true, plan: null })}>+ Новый тариф</button> : null}
        </header>

        {tab === 'subscriptions' ? (
          <div className="admin-billing-console__body">
            <div className="admin-billing-toolbar"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по клиенту или тарифу…" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Все статусы</option><option value="active">Активен</option><option value="trial">Пробный</option><option value="expired">Истёк</option><option value="cancelled">Отменён</option></select><span>{filtered.length} записей</span></div>
            <SubscriptionTable subscriptions={filtered} onOpenClient={(id) => navigate(`/admin/clients/${id}`)} onToggleAutoRenew={toggleAutoRenew} />
          </div>
        ) : null}

        {tab === 'plans' ? (
          <div className="admin-plan-grid">
            {data.plans.map((plan, index) => (
              <article className="admin-plan-card" style={{ '--plan-index': index }} key={plan.id}>
                <header><span>{plan.active ? 'АКТИВНЫЙ ТАРИФ' : 'ОТКЛЮЧЁН'}</span><button type="button" onClick={() => setEditor({ open: true, plan })}>Редактировать</button></header>
                <h3>{plan.name}</h3>
                <small>{String(plan.id).toUpperCase()} · {plan.currency || 'RUB'}</small>
                <div className="admin-plan-card__price"><strong>{formatAdminMoney(plan.price).replace(' ₽','')}</strong><span>₽ / мес</span></div>
                <div className="admin-plan-card__stats"><span><b>{plan.clients}</b><small>клиентов</small></span><span><b>{formatAdminMoney(plan.mrr)}</b><small>текущий MRR</small></span></div>
                <footer><span>Данные из PostgreSQL</span><b>{plan.activeClients} активных</b></footer>
              </article>
            ))}
          </div>
        ) : null}

        {tab === 'renewals' ? (
          <div className="admin-renewals">
            <div className="admin-renewals__summary"><div><span>С известной датой продления</span><strong>{data.renewals.length} подписок</strong></div><div><span>Текущий MRR этих подписок</span><strong>{formatAdminMoney(data.renewals.reduce((sum, item) => sum + item.revenue, 0))}</strong></div><button type="button" onClick={() => window.print()}>Экспорт / печать</button></div>
            <div className="admin-renewals__list">{data.renewals.map((item, index) => <article key={item.clientId} style={{ '--renewal-index': index }}><div className="admin-renewals__date"><span>{item.renewalDate}</span></div><button type="button" onClick={() => navigate(`/admin/clients/${item.clientId}`)}><strong>{item.clientName}</strong><small>{item.planName}</small></button><span className={`admin-subscription-status is-${item.status}`}>{item.statusLabel}</span><strong>{formatAdminMoney(item.revenue)}</strong><button type="button" className={`admin-billing-switch ${item.autoRenew ? 'is-on' : ''}`} onClick={() => toggleAutoRenew(item.clientId, !item.autoRenew)} aria-label="Переключить автопродление"><i /></button></article>)}</div>
          </div>
        ) : null}
      </section>

      <section className="admin-billing-card admin-billing-events">
        <header><div><span>BILLING EVENTS</span><h2>Платёжные события</h2></div><small>{data.paymentHistoryConfigured ? 'provider подключён' : 'provider не подключён'}</small></header>
        {data.events.length ? <div>{data.events.map((event, index) => <article key={event.id} style={{ '--event-index': index }}><i className={`is-${event.tone}`} /><span><strong>{event.title}</strong><small>{event.description}</small></span><time>{event.time}</time></article>)}</div> : <div className="admin-billing-events__empty"><strong>Подтверждённых платёжных событий пока нет</strong><p>Раздел заполнится после подключения production payment provider.</p></div>}
      </section>

      {error ? <div className="admin-billing-toast is-error">{error}</div> : null}
      <PlanEditorModal plan={editor.plan} open={editor.open} saving={saving} onClose={() => setEditor({ open: false, plan: null })} onSave={savePlan} />
    </div>
  );
}
