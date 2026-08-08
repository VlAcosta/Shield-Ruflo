import React from 'react';

export default function BillingMetricCard({ label, value, delta, tone = 'violet', index = 0, caption }) {
  return (
    <article className={`admin-billing-metric is-${tone}`} style={{ '--metric-index': index }}>
      <div className="admin-billing-metric__head"><span>{label}</span><i /></div>
      <strong>{value}</strong>
      <footer><b>{delta}</b><small>{caption || 'за текущий период'}</small></footer>
    </article>
  );
}
