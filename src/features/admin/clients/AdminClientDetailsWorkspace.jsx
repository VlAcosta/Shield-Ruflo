import React, { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Badge from '../../../components/ui/Badge';
import useAdminClients from './hooks/useAdminClients';
import { ADMIN_CLIENT_MANAGERS, ADMIN_CLIENT_PLANS, CLIENT_ACTIVITY, CLIENT_ACTIVITY_SERIES, CLIENT_TICKETS } from './model/adminClientsData';
import './AdminClientDetailsWorkspace.scss';

const STATUS_TONES = { active: 'green', trial: 'violet', expired: 'orange', cancelled: 'neutral' };
const ACTIVITY_TONES = { review: 'orange', task: 'violet', report: 'purple', payment: 'green', manager: 'cyan', integration: 'red' };

function money(value) { return `${Number(value || 0).toLocaleString('ru-RU')} ₽`; }

function ActivityChart() {
  const { labels, values } = CLIENT_ACTIVITY_SERIES;
  const points = useMemo(() => {
    const max = Math.max(...values) + 3;
    return values.map((value, index) => [22 + index * 91, 92 - (value / max) * 62]);
  }, [values]);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
  return (
    <div className="admin-client-activity-chart">
      <svg viewBox="0 0 590 112" preserveAspectRatio="none" role="img" aria-label="Активность клиента за неделю">
        <defs><linearGradient id="clientActivityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#665ff2" stopOpacity=".16"/><stop offset="100%" stopColor="#665ff2" stopOpacity="0"/></linearGradient></defs>
        <path d={`${path} L 568 104 L 22 104 Z`} fill="url(#clientActivityFill)" />
        <path d={path} fill="none" stroke="#665ff2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], index) => <circle key={labels[index]} cx={x} cy={y} r="3.5" fill="#fff" stroke="#665ff2" strokeWidth="2"><title>{labels[index]}: {values[index]} действий</title></circle>)}
      </svg>
      <div>{labels.map((label) => <span key={label}>{label}</span>)}</div>
    </div>
  );
}

function EditClientModal({ client, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    name: client.name, inn: client.inn, email: client.email, phone: client.phone, city: client.city, industry: client.industry,
    planId: client.planId, managerId: client.managerId, status: client.status, expiryDate: client.expiryDate,
  }));
  const [error, setError] = useState('');
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try { await onSave(form); onClose(); } catch (err) { setError(err?.message || 'Не удалось сохранить изменения'); }
  };
  return (
    <div className="admin-client-edit" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="admin-client-edit__dialog" onSubmit={submit} role="dialog" aria-modal="true">
        <header><div><span>КАРТОЧКА КЛИЕНТА</span><h2>Редактировать данные</h2></div><button type="button" onClick={onClose}>×</button></header>
        <div className="admin-client-edit__grid">
          <label className="is-wide"><span>Название</span><input value={form.name} onChange={setField('name')} /></label>
          <label><span>ИНН</span><input value={form.inn} onChange={setField('inn')} /></label>
          <label><span>Email</span><input value={form.email} onChange={setField('email')} /></label>
          <label><span>Телефон</span><input value={form.phone} onChange={setField('phone')} /></label>
          <label><span>Город</span><input value={form.city} onChange={setField('city')} /></label>
          <label><span>Отрасль</span><input value={form.industry} onChange={setField('industry')} /></label>
          <label><span>Тариф</span><select value={form.planId} onChange={setField('planId')}>{ADMIN_CLIENT_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.label}</option>)}</select></label>
          <label><span>Менеджер</span><select value={form.managerId} onChange={setField('managerId')}>{ADMIN_CLIENT_MANAGERS.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
          <label><span>Статус</span><select value={form.status} onChange={setField('status')}><option value="active">Активен</option><option value="trial">Пробный</option><option value="expired">Истёк</option><option value="cancelled">Отменён</option></select></label>
          <label><span>Подписка до</span><input value={form.expiryDate} onChange={setField('expiryDate')} /></label>
        </div>
        {error ? <p className="admin-client-edit__error">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>Отмена</button><button type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></footer>
      </form>
    </div>
  );
}

function AdminClientDetailsWorkspace({ onRefreshReady }) {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { clients, loading, saving, error, refresh, updateClient } = useAdminClients();
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2300); return () => clearTimeout(timer); }, [toast]);

  const client = useMemo(() => clients?.find((item) => item.id === clientId), [clients, clientId]);
  const activities = CLIENT_ACTIVITY[clientId] || [
    { id: 1, type: 'payment', title: 'Подписка активирована', date: client?.startDate || '—' },
    { id: 2, type: 'integration', title: 'Клиент добавлен в систему', date: client?.startDate || '—' },
  ];
  const tickets = CLIENT_TICKETS[clientId] || [];

  if (loading && !clients) return <div className="admin-client-details-skeleton">{Array.from({ length: 8 }).map((_, i) => <i key={i} />)}</div>;
  if (error && !clients) return <section className="admin-client-details-error"><strong>Не удалось загрузить клиента</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;
  if (!client) return <section className="admin-client-not-found"><strong>Клиент не найден</strong><p>Возможно, карточка была удалена или ссылка устарела.</p><button type="button" onClick={() => navigate('/admin/clients')}>Вернуться к клиентам</button></section>;

  const savePatch = async (patch, message = 'Изменения сохранены') => { await updateClient(client.id, patch); setToast(message); };
  const copyContact = async () => {
    const text = `${client.name}\n${client.email}\n${client.phone}`;
    try { await navigator.clipboard.writeText(text); setToast('Контакты скопированы'); } catch { setToast('Не удалось скопировать контакты'); }
  };

  return (
    <div className="admin-client-details">
      <button type="button" className="admin-client-details__back" onClick={() => navigate('/admin/clients')}>← Назад к клиентам</button>

      <section className="admin-client-hero">
        <div className="admin-client-hero__identity"><span>{client.initials}</span><div><div className="admin-client-hero__title"><h2>{client.name}</h2><Badge tone={STATUS_TONES[client.status]}>{client.statusLabel}</Badge></div><p>ИНН {client.inn}<i />{client.industry}<i />⌖ {client.city}</p></div></div>
        <div className="admin-client-hero__actions"><button type="button" onClick={() => setEditOpen(true)}>✎ Редактировать</button><button type="button" className="is-primary" onClick={copyContact}>◌ Контакты</button></div>
      </section>

      <section className="admin-client-kpis">
        <article style={{ '--kpi-index': 0 }}><span className="is-star">★</span><div><strong>{client.rating || '—'}</strong><small>Рейтинг</small></div></article>
        <article style={{ '--kpi-index': 1 }}><span className="is-task">✓</span><div><strong>{client.tasks}</strong><small>Задач</small></div></article>
        <article style={{ '--kpi-index': 2 }}><span className="is-review">↗</span><div><strong>{client.reviews}</strong><small>Отзывов</small></div></article>
        <article style={{ '--kpi-index': 3 }}><span className="is-ticket">◌</span><div><strong>{client.tickets}</strong><small>Тикетов</small></div></article>
      </section>

      <div className="admin-client-details__layout">
        <aside className="admin-client-details__side">
          <section className="admin-client-panel admin-client-contact"><header><span>КЛИЕНТ</span><h3>Контакты</h3></header><ul><li><i>☎</i><span>{client.phone}</span></li><li><i>✉</i><span>{client.email}</span></li><li><i>⌖</i><span>{client.city}</span></li></ul></section>

          <section className="admin-client-panel admin-client-subscription"><header><span>БИЛЛИНГ</span><h3>Подписка</h3></header><dl><div><dt>Тариф</dt><dd><Badge tone="violet">{client.plan}</Badge></dd></div><div><dt>Статус</dt><dd><Badge tone={STATUS_TONES[client.status]}>{client.statusLabel}</Badge></dd></div><div><dt>Начало</dt><dd>{client.startDate}</dd></div><div><dt>До</dt><dd>{client.expiryDate}</dd></div><div className="is-total"><dt>Выручка / мес.</dt><dd>{money(client.revenue)}</dd></div></dl><label><span>Изменить тариф</span><select value={client.planId} onChange={(event) => savePatch({ planId: event.target.value }, 'Тариф изменён')} disabled={saving}>{ADMIN_CLIENT_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.label} — {money(plan.price)}</option>)}</select></label></section>

          <section className="admin-client-panel admin-client-manager"><header><span>КОМАНДА</span><h3>Менеджер</h3></header><div className="admin-client-manager__person"><span>{client.managerInitials}</span><div><strong>{client.managerName}</strong><small>Персональный менеджер</small></div></div><label><span>Переназначить</span><select value={client.managerId} onChange={(event) => savePatch({ managerId: event.target.value }, 'Менеджер переназначен')} disabled={saving}>{ADMIN_CLIENT_MANAGERS.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label></section>
        </aside>

        <main className="admin-client-details__main">
          <section className="admin-client-panel admin-client-week"><header><div><span>АКТИВНОСТЬ</span><h3>Активность за неделю</h3></div><small>Действия / день</small></header><ActivityChart /></section>

          <section className="admin-client-panel admin-client-history"><header><span>ЖУРНАЛ</span><h3>История действий</h3></header><div className="admin-client-history__list">{activities.map((item, index) => <article key={item.id} style={{ '--activity-index': index }}><i className={`is-${ACTIVITY_TONES[item.type] || 'violet'}`} /><div><strong>{item.title}</strong><small>◷ {item.date}</small></div></article>)}</div></section>

          <section className="admin-client-panel admin-client-tickets"><header><div><span>ПОДДЕРЖКА</span><h3>Тикеты клиента</h3></div><small>{tickets.length}</small></header>{tickets.length ? <div>{tickets.map((ticket, index) => <article key={ticket.id} style={{ '--ticket-index': index }} role="button" tabIndex="0" onClick={() => navigate(`/admin/tickets?ticket=${ticket.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/admin/tickets?ticket=${ticket.id}`); }}><span className="admin-client-ticket-dot" /><div><strong>#{ticket.id} {ticket.title}</strong><small>Высокий приоритет</small></div><Badge tone="red">{ticket.statusLabel}</Badge></article>)}</div> : <div className="admin-client-tickets__empty"><span>✓</span><strong>Открытых тикетов нет</strong><p>Сейчас клиенту не требуется техническая поддержка.</p></div>}</section>
        </main>
      </div>

      {editOpen ? <EditClientModal client={client} saving={saving} onClose={() => setEditOpen(false)} onSave={(patch) => savePatch(patch)} /> : null}
      {toast ? <div className="admin-client-toast" role="status">✓ {toast}</div> : null}
    </div>
  );
}

export default memo(AdminClientDetailsWorkspace);
