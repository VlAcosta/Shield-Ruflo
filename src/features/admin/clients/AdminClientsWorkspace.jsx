import React, { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../../../components/ui/Badge';
import useAdminClients from './hooks/useAdminClients';
import { ADMIN_CLIENT_MANAGERS, ADMIN_CLIENT_PLANS } from './model/adminClientsData';
import './AdminClientsWorkspace.scss';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'active', label: 'Активен' },
  { value: 'trial', label: 'Пробный' },
  { value: 'expired', label: 'Истёк' },
  { value: 'cancelled', label: 'Отменён' },
];

const STATUS_TONES = { active: 'green', trial: 'violet', expired: 'orange', cancelled: 'neutral' };

function formatMoney(value) {
  return value ? `${Number(value).toLocaleString('ru-RU')} ₽` : '—';
}

function parseRuDate(value) {
  if (!value) return 0;
  const [day, month, year] = value.split('.').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).getTime();
}

function ClientMetricIcon({ tone }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (tone === 'green') return <svg {...common}><path d="M5 12.5 9.2 16.5 19 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (tone === 'purple') return <svg {...common}><path d="M7 7.5h10M8.5 4.5v3M15.5 4.5v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><rect x="5" y="7" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7"/></svg>;
  if (tone === 'orange') return <svg {...common}><path d="M6 17V11m6 6V7m6 10V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  return <svg {...common}><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M4.8 18c.9-2.5 2.4-3.8 4.2-3.8 1.9 0 3.4 1.3 4.3 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M17 8v6m-3-3h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function Metric({ label, value, tone, index }) {
  return (
    <article className={`admin-clients-metric is-${tone}`} style={{ '--metric-index': index }}>
      <div><span>{label}</span><i className="admin-clients-metric__icon"><ClientMetricIcon tone={tone} /></i></div>
      <strong>{value}</strong>
      <small>актуально сейчас</small>
      <b aria-hidden="true" />
    </article>
  );
}

function CreateClientModal({ open, saving, onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '', inn: '', email: '', phone: '', planId: 'professional', managerId: 'alexey', status: 'active', city: '', industry: '', expiryDate: '17.03.2026',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.name.trim().length < 3) return setError('Укажите название компании');
    if (!/^\d{10,12}$/.test(form.inn.trim())) return setError('ИНН должен содержать 10–12 цифр');
    if (!form.email.includes('@')) return setError('Проверьте email');
    try {
      const created = await onCreate(form);
      onClose(created);
    } catch (err) {
      setError(err?.message || 'Не удалось создать клиента');
    }
  };

  return (
    <div className="admin-client-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="admin-client-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="create-client-title" onSubmit={submit}>
        <header><div><span>НОВЫЙ КЛИЕНТ</span><h2 id="create-client-title">Добавить клиента</h2></div><button type="button" onClick={() => onClose()} aria-label="Закрыть">×</button></header>
        <div className="admin-client-modal__grid">
          <label className="is-wide"><span>Название компании</span><input autoFocus value={form.name} onChange={setField('name')} placeholder="ООО «Название»" /></label>
          <label><span>ИНН</span><input inputMode="numeric" value={form.inn} onChange={setField('inn')} placeholder="7700000000" /></label>
          <label><span>Email</span><input type="email" value={form.email} onChange={setField('email')} placeholder="email@company.ru" /></label>
          <label><span>Телефон</span><input value={form.phone} onChange={setField('phone')} placeholder="+7 (999) 000-00-00" /></label>
          <label><span>Город</span><input value={form.city} onChange={setField('city')} placeholder="Москва" /></label>
          <label><span>Отрасль</span><input value={form.industry} onChange={setField('industry')} placeholder="Торговля" /></label>
          <label><span>Тариф</span><select value={form.planId} onChange={setField('planId')}>{ADMIN_CLIENT_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.label}</option>)}</select></label>
          <label><span>Менеджер</span><select value={form.managerId} onChange={setField('managerId')}>{ADMIN_CLIENT_MANAGERS.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
          <label><span>Статус</span><select value={form.status} onChange={setField('status')}>{STATUS_OPTIONS.slice(1).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Подписка до</span><input value={form.expiryDate} onChange={setField('expiryDate')} placeholder="17.03.2026" /></label>
        </div>
        {error ? <p className="admin-client-modal__error">{error}</p> : null}
        <footer><button type="button" className="admin-client-modal__cancel" onClick={() => onClose()}>Отмена</button><button type="submit" className="admin-client-modal__submit" disabled={saving}>{saving ? 'Создаём…' : 'Создать клиента'}</button></footer>
      </form>
    </div>
  );
}

function Skeleton() {
  return <div className="admin-clients-skeleton"><div className="admin-clients-skeleton__metrics">{Array.from({ length: 4 }).map((_, i) => <i key={i} />)}</div><b /><div className="admin-clients-skeleton__table">{Array.from({ length: 9 }).map((_, i) => <i key={i} />)}</div></div>;
}

function AdminClientsWorkspace({ onRefreshReady }) {
  const navigate = useNavigate();
  const { clients, metrics, loading, saving, error, refresh, createClient } = useAdminClients();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState('all');
  const [planId, setPlanId] = useState('all');
  const [managerId, setManagerId] = useState('all');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);

  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    const next = (clients || []).filter((client) => {
      const matchesQuery = !normalized || `${client.name} ${client.inn} ${client.email} ${client.phone}`.toLowerCase().includes(normalized);
      return matchesQuery && (status === 'all' || client.status === status) && (planId === 'all' || client.planId === planId) && (managerId === 'all' || client.managerId === managerId);
    });
    const direction = sort.dir === 'asc' ? 1 : -1;
    return next.sort((a, b) => {
      if (sort.key === 'revenue') return (Number(a.revenue) - Number(b.revenue)) * direction;
      if (sort.key === 'rating') return (Number(a.rating) - Number(b.rating)) * direction;
      if (sort.key === 'expiryDate') return (parseRuDate(a.expiryDate) - parseRuDate(b.expiryDate)) * direction;
      return String(a.name).localeCompare(String(b.name), 'ru') * direction;
    });
  }, [clients, deferredQuery, status, planId, managerId, sort]);

  const toggleSort = (key) => setSort((current) => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  const sortMark = (key) => sort.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕';

  const closeCreate = (created) => {
    setCreateOpen(false);
    if (created?.id) navigate(`/admin/clients/${created.id}`);
  };

  if (loading && !clients) return <Skeleton />;
  if (error && !clients) return <section className="admin-clients-error"><strong>Не удалось загрузить клиентов</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;

  const activeShare = metrics.total ? Math.round((metrics.active / metrics.total) * 100) : 0;
  const filtersActive = Number(status !== 'all') + Number(planId !== 'all') + Number(managerId !== 'all') + Number(Boolean(query.trim()));

  return (
    <div className="admin-clients-page">
      <section className="admin-clients-intro">
        <div><span>CLIENT OPERATIONS</span><h2>Клиентская база</h2><p>Управляйте подписками, ответственными менеджерами и состоянием каждого аккаунта.</p></div>
        <div className="admin-clients-intro__score"><i style={{ '--score': `${activeShare}%` }} /><span><strong>{activeShare}%</strong><small>активная база</small></span></div>
      </section>

      <section className="admin-clients-metrics" aria-label="Показатели клиентов">
        <Metric label="Всего клиентов" value={metrics.total} tone="violet" index={0} />
        <Metric label="Активных" value={metrics.active} tone="green" index={1} />
        <Metric label="На пробном" value={metrics.trial} tone="purple" index={2} />
        <Metric label="Выручка / мес." value={formatMoney(metrics.revenue)} tone="orange" index={3} />
      </section>

      <section className="admin-clients-toolbar">
        <div className="admin-clients-toolbar__meta"><span>ФИЛЬТРЫ</span>{filtersActive ? <b>{filtersActive} активно</b> : <small>Все клиенты</small>}</div>
        <label className="admin-clients-toolbar__search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по названию, ИНН, email…" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Статус клиента">{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <select value={planId} onChange={(event) => setPlanId(event.target.value)} aria-label="Тариф"><option value="all">Все тарифы</option>{ADMIN_CLIENT_PLANS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <select value={managerId} onChange={(event) => setManagerId(event.target.value)} aria-label="Менеджер"><option value="all">Все менеджеры</option>{ADMIN_CLIENT_MANAGERS.map((item) => <option key={item.id} value={item.id}>{item.short}</option>)}</select>
        <button type="button" className="admin-clients-toolbar__add" onClick={() => setCreateOpen(true)}>+ Добавить</button>
      </section>

      <section className="admin-clients-table-card">
        <header><div><span>CRM</span><h2>Клиенты</h2></div><small>{filtered.length} из {clients?.length || 0}</small></header>
        <div className="admin-clients-table-wrap">
          <table className="admin-clients-table">
            <thead><tr>
              <th><button type="button" onClick={() => toggleSort('name')}>Клиент {sortMark('name')}</button></th>
              <th>Тариф</th><th>Статус</th><th>Менеджер</th>
              <th><button type="button" onClick={() => toggleSort('revenue')}>Выручка {sortMark('revenue')}</button></th>
              <th><button type="button" onClick={() => toggleSort('rating')}>Рейтинг {sortMark('rating')}</button></th>
              <th><button type="button" onClick={() => toggleSort('expiryDate')}>До {sortMark('expiryDate')}</button></th><th aria-label="Открыть" />
            </tr></thead>
            <tbody>{filtered.map((client, index) => (
              <tr key={client.id} style={{ '--row-index': index }} onClick={() => navigate(`/admin/clients/${client.id}`)} tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/admin/clients/${client.id}`); }}>
                <td><div className="admin-clients-table__client"><span>{client.initials}</span><div><strong>{client.name}</strong><small>ИНН {client.inn}</small></div></div></td>
                <td><Badge tone="violet">{client.plan}</Badge></td>
                <td><Badge tone={STATUS_TONES[client.status]}>{client.statusLabel}</Badge></td>
                <td>{client.manager}</td>
                <td><strong className={client.revenue ? 'is-revenue' : ''}>{formatMoney(client.revenue)}</strong></td>
                <td><strong className={Number(client.rating) < 3.5 ? 'is-rating-low' : 'is-rating'}>{client.rating ? `★ ${client.rating}` : '—'}</strong></td>
                <td>{client.expiryDate || '—'}</td><td><span className="admin-clients-table__arrow">›</span></td>
              </tr>
            ))}</tbody>
          </table>
          {!filtered.length ? <div className="admin-clients-empty"><span>⌕</span><strong>Клиенты не найдены</strong><p>Измените поиск или сбросьте фильтры.</p><button type="button" onClick={() => { setQuery(''); setStatus('all'); setPlanId('all'); setManagerId('all'); }}>Сбросить фильтры</button></div> : null}
        </div>
      </section>

      <CreateClientModal open={createOpen} saving={saving} onClose={closeCreate} onCreate={createClient} />
    </div>
  );
}

export default memo(AdminClientsWorkspace);
