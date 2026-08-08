import React, { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../../../components/ui/Badge';
import useAdminDashboard from './hooks/useAdminDashboard';
import './AdminDashboardWorkspace.scss';

function MetricGlyph({ id }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (id === 'revenue') return <svg {...common}><path d="M5 17 9.2 12.8l3 2.4L19 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.5 8H19v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (id === 'clients') return <svg {...common}><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M4.8 18c.9-2.5 2.4-3.8 4.2-3.8 1.9 0 3.4 1.3 4.3 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="16.5" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5"/><path d="M15.4 14.6c1.9.2 3.2 1.3 3.8 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
  if (id === 'churn') return <svg {...common}><path d="m5 8 4.5 4.5 3-3L19 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.5 16H19v-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (id === 'tickets') return <svg {...common}><path d="M5 7.5h14v3a2.2 2.2 0 0 0 0 4v3H5v-3a2.2 2.2 0 0 0 0-4v-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>;
  if (id === 'newClients') return <svg {...common}><circle cx="10" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M5 18c1-2.7 2.7-4 5-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M17 12v6m-3-3h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  return <svg {...common}><rect x="5" y="6" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function MetricCard({ item, index }) {
  return (
    <article className={`admin-metric admin-metric--${item.tone}`} style={{ '--delay': `${index * 55}ms` }}>
      <div className="admin-metric__top">
        <span>{item.label}</span>
        <i className="admin-metric__icon"><MetricGlyph id={item.id} /></i>
      </div>
      <strong>{item.value}</strong>
      <div className="admin-metric__foot">
        <small className={item.id === 'tickets' ? 'is-danger' : 'is-positive'}>{item.direction === 'down' ? '↓' : '↑'} {item.delta}</small>
        <span>за период</span>
      </div>
      <b className="admin-metric__accent" aria-hidden="true" />
    </article>
  );
}

function RevenueChart({ series }) {
  const points = useMemo(() => {
    const min = Math.min(...series.values) - 30;
    const max = Math.max(...series.values) + 20;
    return series.values.map((value, index) => {
      const x = 26 + index * (548 / (series.values.length - 1));
      const y = 130 - ((value - min) / (max - min)) * 88;
      return [x, y];
    });
  }, [series]);

  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `26,154 ${line} 574,154`;
  const latest = series.values[series.values.length - 1];
  const previous = series.values[series.values.length - 2] || latest;
  const velocity = previous ? ((latest - previous) / previous) * 100 : 0;

  return (
    <section id="admin-revenue" className="admin-card admin-revenue-card">
      <header>
        <div className="admin-card__heading"><span>ФИНАНСЫ</span><h2>Выручка</h2><small>Динамика MRR по месяцам</small></div>
        <div className="admin-revenue-card__summary">
          <span className="admin-revenue-card__signal"><i /> LIVE</span>
          <strong>847 500 ₽</strong>
          <small>+3.2%</small>
        </div>
      </header>

      <div className="admin-revenue-card__meta">
        <span><b>{latest}</b> тыс. ₽ сейчас</span>
        <span><b className="is-positive">+{velocity.toFixed(1)}%</b> к прошлому месяцу</span>
      </div>

      <div className="admin-revenue-card__chart">
        <svg viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label="График выручки">
          <defs>
            <linearGradient id="adminRevenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6a5cff" stopOpacity=".22"/><stop offset="100%" stopColor="#6a5cff" stopOpacity="0"/></linearGradient>
            <linearGradient id="adminRevenueLine" x1="0" x2="1"><stop offset="0%" stopColor="#625df2"/><stop offset="60%" stopColor="#765cf4"/><stop offset="100%" stopColor="#a140ef"/></linearGradient>
          </defs>
          {[42,80,118].map((y) => <line key={y} x1="20" y1={y} x2="580" y2={y} stroke="#edf0f6" strokeDasharray="3 6" />)}
          <polygon className="admin-revenue-card__area" points={area} fill="url(#adminRevenueFill)" />
          <polyline className="admin-revenue-card__line" points={line} fill="none" stroke="url(#adminRevenueLine)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(([x,y], index) => (
            <g className="admin-revenue-card__point" key={series.months[index]}>
              <circle cx={x} cy={y} r="9" fill="transparent" />
              <circle cx={x} cy={y} r="4" fill="#fff" stroke={index === points.length - 1 ? '#a140ef' : '#665ff2'} strokeWidth="2.5" />
              <title>{series.months[index]}: {series.values[index]} тыс. ₽</title>
            </g>
          ))}
        </svg>
        <div className="admin-revenue-card__months">{series.months.map((month) => <span key={month}>{month}</span>)}</div>
      </div>
    </section>
  );
}

function TariffsCard({ tariffs }) {
  const total = tariffs.reduce((sum, item) => sum + item.count, 0);
  let offset = 0;
  return (
    <section id="admin-tariffs" className="admin-card admin-tariffs-card">
      <header><div className="admin-card__heading"><span>СТРУКТУРА</span><h2>Тарифы</h2><small>Распределение активных клиентов</small></div></header>
      <div className="admin-tariffs-card__visual">
        <div className="admin-tariffs-card__donut">
          <svg viewBox="0 0 120 120" role="img" aria-label="Распределение тарифов">
            <circle cx="60" cy="60" r="40" fill="none" stroke="#f0f1f6" strokeWidth="16" />
            {tariffs.map((item, index) => {
              const length = (item.count / total) * 251.2;
              const node = <circle className="admin-tariffs-card__segment" style={{ '--segment-index': index }} key={item.id} cx="60" cy="60" r="40" fill="none" stroke={item.tone} strokeWidth="16" strokeDasharray={`${length} ${251.2 - length}`} strokeDashoffset={-offset} strokeLinecap="butt" transform="rotate(-90 60 60)" />;
              offset += length;
              return node;
            })}
            <text x="60" y="57" textAnchor="middle" className="admin-tariffs-card__donut-value">{total}</text>
            <text x="60" y="72" textAnchor="middle" className="admin-tariffs-card__donut-label">клиентов</text>
          </svg>
        </div>
        <div className="admin-tariffs-card__legend">
          {tariffs.map((item) => (
            <div key={item.id}>
              <i style={{ background:item.tone }} />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-tariffs-card__foot"><span>Всего в системе</span><strong>{total} клиентов</strong></div>
    </section>
  );
}

function ClientsCard({ clients, onOpenAll, onOpenClient }) {
  return (
    <section id="admin-clients" className="admin-card admin-list-card">
      <header><div className="admin-card__heading"><span>CRM</span><h2>Последние клиенты</h2><small>Недавно добавленные и активированные</small></div><button type="button" onClick={onOpenAll}>Все клиенты <b>→</b></button></header>
      <div className="admin-list-card__rows">
        {clients.map((client, index) => (
          <article
            key={client.id}
            className="admin-client-row"
            style={{ '--row-index': index }}
            role="button"
            tabIndex="0"
            onClick={() => onOpenClient(client.id)}
            onKeyDown={(event) => { if (event.key === 'Enter') onOpenClient(client.id); }}
          >
            <span className={`admin-avatar admin-avatar--${client.tone}`}>{client.initials}</span>
            <div><strong>{client.name}</strong><small>{client.meta}</small></div>
            <div className="admin-client-row__right"><strong>{client.revenue}</strong><Badge tone={client.status === 'Активен' ? 'green' : client.status === 'Пробный' ? 'violet' : 'orange'}>{client.status}</Badge></div>
            <span className="admin-list-card__arrow">›</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function TicketsCard({ tickets, onOpenAll, onOpenTicket }) {
  return (
    <section id="admin-tickets" className="admin-card admin-list-card admin-tickets-card">
      <header><div className="admin-card__heading"><span>ПОДДЕРЖКА</span><h2>Открытые тикеты</h2><small>Требуют внимания команды</small></div><button type="button" onClick={onOpenAll}>Все <b>→</b></button></header>
      <div className="admin-list-card__rows">
        {tickets.map((ticket, index) => (
          <article key={ticket.id} className="admin-ticket-row" style={{ '--row-index': index }} role="button" tabIndex="0" onClick={() => onOpenTicket(String(ticket.id).replace('#',''))} onKeyDown={(event) => { if (event.key === 'Enter') onOpenTicket(String(ticket.id).replace('#','')); }}>
            <i className={`is-${ticket.tone}`} />
            <div><strong>{ticket.title}</strong><small>{ticket.company}</small></div>
            <Badge tone={ticket.tone === 'orange' ? 'orange' : 'red'}>{ticket.status}</Badge>
          </article>
        ))}
      </div>
    </section>
  );
}

function ManagersCard({ managers, onOpenAll, onOpenManager }) {
  return (
    <section id="admin-managers" className="admin-card admin-managers-card">
      <header><div className="admin-card__heading"><span>КОМАНДА</span><h2>Менеджеры</h2><small>Загрузка и рейтинг</small></div><button type="button" onClick={onOpenAll}>Все <b>→</b></button></header>
      {managers.map((manager, index) => (
        <button type="button" className="admin-manager-row" style={{ '--row-index': index }} key={manager.id} onClick={() => onOpenManager(manager.id)}>
          <span className={`admin-avatar admin-avatar--${manager.tone}`}>{manager.initials}</span>
          <div><strong>{manager.name}</strong><small>{manager.clients} клиентов</small></div>
          <span>★ {manager.rating}</span>
        </button>
      ))}
    </section>
  );
}

function ManagerRevenue({ managers }) {
  const max = Math.max(...managers.map((manager) => manager.revenue));
  const total = managers.reduce((sum, manager) => sum + manager.revenue, 0);
  return (
    <section id="admin-manager-revenue" className="admin-card admin-manager-revenue">
      <header><div className="admin-card__heading"><span>ЭФФЕКТИВНОСТЬ</span><h2>Выручка по менеджерам</h2><small>Вклад команды в месячный оборот</small></div><strong className="admin-manager-revenue__total">{total.toLocaleString('ru-RU')} ₽</strong></header>
      <div className="admin-manager-revenue__rows">
        {managers.map((manager, index) => (
          <div key={manager.id} style={{ '--row-index': index }}>
            <span>{manager.name}</span>
            <div><i className={`is-${manager.tone}`} style={{ width:`${(manager.revenue / max) * 100}%` }}><b>{manager.revenue.toLocaleString('ru-RU')} ₽</b></i></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return <div className="admin-dashboard-skeleton">{Array.from({ length: 10 }).map((_, i) => <i key={i} />)}</div>;
}

function AdminDashboardWorkspace({ onRefreshReady }) {
  const navigate = useNavigate();
  const { data, error, refreshing, refresh } = useAdminDashboard();
  React.useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);

  if (!data && refreshing) return <Skeleton />;
  if (!data && error) return <section className="admin-dashboard-error"><strong>Не удалось загрузить дашборд</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;
  if (!data) return null;

  return (
    <div className={`admin-dashboard ${refreshing ? 'is-refreshing' : ''}`}>
      <section className="admin-dashboard__intro">
        <div><span>COMMAND CENTER</span><h2>Система под контролем</h2><p>Ключевые показатели бизнеса, клиентов и поддержки в одном рабочем пространстве.</p></div>
        <div className="admin-dashboard__health"><i /><span><strong>99.98%</strong><small>стабильность сервисов</small></span></div>
      </section>

      <div className="admin-dashboard__metrics">{data.metrics.map((item, index) => <MetricCard key={item.id} item={item} index={index} />)}</div>
      <div className="admin-dashboard__grid">
        <RevenueChart series={data.revenue} />
        <TariffsCard tariffs={data.tariffs} />
        <ClientsCard clients={data.clients} onOpenAll={() => navigate('/admin/clients')} onOpenClient={(id) => navigate(`/admin/clients/${id}`)} />
        <TicketsCard tickets={data.tickets} onOpenAll={() => navigate('/admin/tickets')} onOpenTicket={(id) => navigate(`/admin/tickets?ticket=${id}`)} />
        <ManagersCard managers={data.managers} onOpenAll={() => navigate('/admin/managers')} onOpenManager={() => navigate('/admin/managers')} />
        <ManagerRevenue managers={data.managers} />
      </div>
    </div>
  );
}

export default memo(AdminDashboardWorkspace);
