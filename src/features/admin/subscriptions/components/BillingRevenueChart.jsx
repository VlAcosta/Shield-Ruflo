import React from 'react';

export default function BillingRevenueChart({ configured = false, series = null }) {
  const hasMeasuredHistory = configured && Array.isArray(series?.labels) && series.labels.length > 1;

  return (
    <section className="admin-billing-chart admin-billing-card">
      <header>
        <div>
          <span>REVENUE HISTORY</span>
          <h2>История выручки</h2>
          <p>Динамика строится только по подтверждённой истории платежей.</p>
        </div>
      </header>
      {hasMeasuredHistory ? (
        <div className="admin-billing-chart__canvas" role="img" aria-label="История подтверждённой выручки">
          <div>{series.labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
        </div>
      ) : (
        <div className="admin-billing-chart__empty" role="status">
          <strong>История платежей пока не подключена</strong>
          <p>Текущий MRR рассчитывается по активным подпискам в PostgreSQL, но график не строится без реальных платёжных событий.</p>
        </div>
      )}
    </section>
  );
}
