import React, { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../../../../components/ui/Badge';

function Sparkline({ values = [] }) {
  const points = useMemo(() => {
    const safe = values.length ? values : [0, 0];
    const min = Math.min(...safe) - 4;
    const max = Math.max(...safe) + 4;
    return safe.map((value, index) => {
      const x = 8 + index * (164 / Math.max(1, safe.length - 1));
      const y = 54 - ((value - min) / Math.max(1, max - min)) * 38;
      return `${x},${y}`;
    }).join(' ');
  }, [values]);

  return (
    <svg viewBox="0 0 180 64" preserveAspectRatio="none" aria-label="Динамика эффективности">
      <defs>
        <linearGradient id="managerSparkline" x1="0" x2="1"><stop offset="0" stopColor="#685ff4"/><stop offset="1" stopColor="#a442ef"/></linearGradient>
      </defs>
      <line x1="8" y1="52" x2="172" y2="52" stroke="#eef0f6" strokeDasharray="3 5" />
      <polyline className="admin-manager-detail__sparkline-path" points={points} fill="none" stroke="url(#managerSparkline)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ManagerDetailsPanel({ manager, allClients, saving, onEdit, onAssignClient }) {
  const navigate = useNavigate();
  const [assigning, setAssigning] = useState(false);
  const [clientId, setClientId] = useState('');
  const availableClients = (allClients || []).filter((client) => client.managerId !== manager.id);

  const submitAssign = async () => {
    if (!clientId) return;
    await onAssignClient(clientId, manager.id);
    setClientId('');
    setAssigning(false);
  };

  return (
    <aside className="admin-manager-detail" key={manager.id}>
      <div className="admin-manager-detail__spotlight" aria-hidden="true" />
      <header className="admin-manager-detail__hero">
        <div className={`admin-manager-detail__avatar is-${manager.tone}`}>{manager.initials}</div>
        <div className="admin-manager-detail__identity">
          <span>TEAM PROFILE</span>
          <h2>{manager.name}</h2>
          <p>{manager.role}</p>
          <div>
            <Badge tone={manager.status === 'active' ? 'green' : manager.status === 'training' ? 'orange' : 'neutral'}>{manager.statusLabel}</Badge>
            <small>с {manager.joinedAt}</small>
          </div>
        </div>
        <button type="button" className="admin-manager-detail__edit" onClick={onEdit}>Редактировать</button>
      </header>

      <div className="admin-manager-detail__contacts">
        <a href={`mailto:${manager.email}`}>{manager.email}</a>
        <a href={`tel:${manager.phone.replace(/\s|\(|\)|-/g, '')}`}>{manager.phone}</a>
      </div>

      <div className="admin-manager-detail__kpis">
        <article><span>Выручка / мес.</span><strong>{manager.revenue.toLocaleString('ru-RU')} ₽</strong><small>активные клиенты</small></article>
        <article><span>Рейтинг</span><strong>{manager.rating ? `★ ${manager.rating.toFixed(1)}` : '—'}</strong><small>{manager.satisfaction ? `${manager.satisfaction}% CSAT` : 'обучение'}</small></article>
        <article><span>Открытых тикетов</span><strong>{manager.openTickets}</strong><small>{manager.responseTime ? `${manager.responseTime} мин. ответ` : 'нет данных'}</small></article>
      </div>

      <section className="admin-manager-detail__performance">
        <div>
          <span>ЭФФЕКТИВНОСТЬ</span>
          <strong>{manager.status === 'training' ? 'Адаптация' : 'Динамика недели'}</strong>
          <small>{manager.status === 'training' ? 'Прогресс обучения и включения в команду' : 'Стабильность сервиса и качество работы'}</small>
        </div>
        <Sparkline values={manager.performance} />
      </section>

      <section className="admin-manager-detail__clients">
        <header>
          <div><span>ПОРТФЕЛЬ</span><h3>Клиенты ({manager.clientsCount})</h3></div>
          <button type="button" onClick={() => setAssigning((value) => !value)}>+ Назначить</button>
        </header>

        {assigning ? (
          <div className="admin-manager-detail__assign">
            <select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Выберите клиента</option>
              {availableClients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.manager}</option>)}
            </select>
            <button type="button" disabled={!clientId || saving} onClick={submitAssign}>{saving ? 'Сохраняем…' : 'Назначить'}</button>
          </div>
        ) : null}

        <div className="admin-manager-detail__client-list">
          {manager.clients.length ? manager.clients.map((client, index) => (
            <button key={client.id} type="button" style={{ '--client-index': index }} onClick={() => navigate(`/admin/clients/${client.id}`)}>
              <span>{client.initials}</span>
              <div><strong>{client.name}</strong><small>{client.plan} · до {client.expiryDate}</small></div>
              <div><strong>{Number(client.revenue || 0).toLocaleString('ru-RU')} ₽</strong><Badge tone={client.status === 'active' ? 'green' : client.status === 'trial' ? 'violet' : 'orange'}>{client.statusLabel}</Badge></div>
              <b>›</b>
            </button>
          )) : (
            <div className="admin-manager-detail__empty">У менеджера пока нет назначенных клиентов</div>
          )}
        </div>
      </section>
    </aside>
  );
}

export default memo(ManagerDetailsPanel);
