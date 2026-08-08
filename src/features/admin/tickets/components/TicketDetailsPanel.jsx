import React, { memo } from 'react';
import Badge from '../../../../components/ui/Badge';
import TicketConversation from './TicketConversation';
import { getPriorityMeta, getStatusMeta, TICKET_STATUS_OPTIONS } from '../model/adminTicketsData';

function TicketDetailsPanel({ ticket, managers, saving, onPatch, onAssign, onSend, onOpenClient }) {
  if (!ticket) {
    return (
      <section className="admin-ticket-empty-detail">
        <span>⌁</span><strong>Выберите тикет</strong><p>Откройте обращение из очереди, чтобы посмотреть диалог и действия.</p>
      </section>
    );
  }

  const status = getStatusMeta(ticket.status);
  const priority = getPriorityMeta(ticket.priority);
  const slaPercent = Math.min(100, Math.round((Number(ticket.firstResponseMinutes || 0) / Math.max(1, Number(ticket.slaMinutes || 60))) * 100));

  return (
    <section className="admin-ticket-detail" key={ticket.id}>
      <header className="admin-ticket-detail__hero">
        <div>
          <span className="admin-ticket-detail__overline"><b>#{ticket.id}</b><Badge tone={priority.tone}>{priority.label}</Badge><Badge tone={status.tone}>{status.label}</Badge></span>
          <h2>{ticket.subject}</h2>
          <button type="button" onClick={() => onOpenClient(ticket.clientId)}>{ticket.clientName} <span>↗</span></button>
        </div>
        <div className="admin-ticket-detail__hero-actions">
          {ticket.status !== 'closed' ? (
            <button type="button" className="is-close" disabled={saving} onClick={() => onPatch({ status: 'closed', unread: 0 })}>✓ Закрыть</button>
          ) : (
            <button type="button" disabled={saving} onClick={() => onPatch({ status: 'open' })}>↻ Переоткрыть</button>
          )}
        </div>
      </header>

      <div className="admin-ticket-detail__toolbar">
        <label><span>Статус</span><select value={ticket.status} disabled={saving} onChange={(event) => onPatch({ status: event.target.value })}>{TICKET_STATUS_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Исполнитель</span><select value={ticket.assignedManagerId || ''} disabled={saving} onChange={(event) => onAssign(event.target.value)}><option value="">Не назначен</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
        <div><span>Категория</span><strong>{ticket.category}</strong></div>
        <div><span>Канал</span><strong>{ticket.channel}</strong></div>
      </div>

      <div className="admin-ticket-detail__body">
        <TicketConversation ticket={ticket} saving={saving} onSend={onSend} />
        <aside className="admin-ticket-inspector">
          <section className="admin-ticket-inspector__sla">
            <header><span>SLA ответа</span><strong>{ticket.firstResponseMinutes} / {ticket.slaMinutes} мин</strong></header>
            <div><i style={{ width: `${slaPercent}%` }} /></div>
            <small className={slaPercent >= 70 ? 'is-risk' : ''}>{slaPercent >= 70 ? 'Близко к лимиту' : 'В пределах SLA'}</small>
          </section>

          <section>
            <header><span>Контекст</span></header>
            <dl>
              <div><dt>Создан</dt><dd>{ticket.createdAt}</dd></div>
              <div><dt>Обновлён</dt><dd>{ticket.updatedAt}</dd></div>
              <div><dt>Сообщений</dt><dd>{ticket.messages.length}</dd></div>
              <div><dt>Приоритет</dt><dd>{priority.label}</dd></div>
            </dl>
          </section>

          <section className="admin-ticket-inspector__timeline">
            <header><span>История</span></header>
            <div>{ticket.activity.slice().reverse().map((item, index) => <article key={item.id} style={{ '--timeline-index': index }}><i /><div><strong>{item.label}</strong><time>{item.at}</time></div></article>)}</div>
          </section>
        </aside>
      </div>
    </section>
  );
}

export default memo(TicketDetailsPanel);
