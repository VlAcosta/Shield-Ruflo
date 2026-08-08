import React, { memo } from 'react';
import { formatAdminMoney } from '../model/adminSubscriptionsData';

function SubscriptionTable({ subscriptions, plans, onOpenClient, onChangePlan, onToggleAutoRenew }) {
  return (
    <div className="admin-subscription-table-wrap">
      <table className="admin-subscription-table">
        <thead><tr><th>Клиент</th><th>Тариф</th><th>Статус</th><th>Начало</th><th>Истекает</th><th>Выручка / мес.</th><th>Авто</th><th /></tr></thead>
        <tbody>
          {subscriptions.map((item, index) => (
            <tr key={item.clientId} style={{ '--row-index': index }}>
              <td><button type="button" className="admin-subscription-table__client" onClick={() => onOpenClient(item.clientId)}><span>{item.initials}</span><div><strong>{item.clientName}</strong><small>{item.managerName}</small></div></button></td>
              <td><select value={item.planId} onChange={(event) => onChangePlan(item.clientId, event.target.value)}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></td>
              <td><span className={`admin-subscription-status is-${item.status}`}>{item.statusLabel}</span></td>
              <td>{item.startDate}</td><td>{item.expiryDate}</td><td><strong>{formatAdminMoney(item.revenue)}</strong></td>
              <td><button type="button" className={`admin-billing-switch ${item.autoRenew ? 'is-on' : ''}`} onClick={() => onToggleAutoRenew(item.clientId, !item.autoRenew)} aria-label="Переключить автопродление"><i /></button></td>
              <td><button type="button" className="admin-subscription-table__arrow" onClick={() => onOpenClient(item.clientId)}>›</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default memo(SubscriptionTable);
