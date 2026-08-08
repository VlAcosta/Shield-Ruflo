import React, { memo } from 'react';
import Badge from '../../../../components/ui/Badge';

const toneByStatus = { active: 'green', training: 'orange', paused: 'neutral' };

function ManagerList({ managers, selectedId, onSelect }) {
  return (
    <section className="admin-manager-list" aria-label="Команда менеджеров">
      {managers.map((manager, index) => (
        <button
          key={manager.id}
          type="button"
          className={`admin-manager-list__item ${selectedId === manager.id ? 'is-selected' : ''}`}
          style={{ '--manager-index': index }}
          onClick={() => onSelect(manager.id)}
        >
          <span className={`admin-manager-list__avatar is-${manager.tone}`}>{manager.initials}</span>
          <span className="admin-manager-list__identity">
            <strong>{manager.name}</strong>
            <small>с {manager.joinedAt}</small>
          </span>
          <span className="admin-manager-list__status">
            <Badge tone={toneByStatus[manager.status] || 'neutral'}>{manager.statusLabel}</Badge>
          </span>
          <span className="admin-manager-list__stats">
            <span><b>{manager.clientsCount}</b><small>клиентов</small></span>
            <span><b>{manager.rating ? manager.rating.toFixed(1) : '—'}</b><small>рейтинг</small></span>
            <span><b>{manager.openTickets}</b><small>тикетов</small></span>
          </span>
          <span className="admin-manager-list__load">
            <i><b style={{ width: `${manager.load}%` }} /></i>
            <small>{manager.load}% загрузки</small>
          </span>
          <span className="admin-manager-list__arrow">›</span>
        </button>
      ))}
    </section>
  );
}

export default memo(ManagerList);
