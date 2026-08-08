import React, { memo } from 'react';
import Badge from '../../../../components/ui/Badge';
import { getPriorityMeta, getStatusMeta } from '../model/adminTicketsData';

function TicketQueueItem({ ticket, selected, index, onSelect }) {
  const status = getStatusMeta(ticket.status);
  const priority = getPriorityMeta(ticket.priority);
  return (
    <button
      type="button"
      className={`admin-ticket-queue-item ${selected ? 'is-selected' : ''}`}
      style={{ '--ticket-index': index }}
      onClick={() => onSelect(ticket.id)}
      aria-pressed={selected}
    >
      <span className={`admin-ticket-queue-item__priority is-${priority.tone}`} aria-hidden="true" />
      <span className="admin-ticket-queue-item__copy">
        <span className="admin-ticket-queue-item__top">
          <b>#{ticket.id}</b>
          <time>{ticket.updatedAt?.split(' ')[0]}</time>
        </span>
        <strong>{ticket.subject}</strong>
        <small>{ticket.clientName}</small>
        <span className="admin-ticket-queue-item__meta">
          <Badge tone={status.tone}>{status.label}</Badge>
          <em>{ticket.messages?.length || 0} сообщ.</em>
          {ticket.unread ? <i>{ticket.unread}</i> : null}
        </span>
      </span>
      <span className="admin-ticket-queue-item__arrow">›</span>
    </button>
  );
}

export default memo(TicketQueueItem);
