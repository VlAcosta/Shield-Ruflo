import React, { useMemo } from 'react';
import { BILLING_REVENUE_SERIES } from '../model/adminSubscriptionsData';

function points(values, maxValue) {
  return values.map((value, index) => {
    const x = 24 + index * 106;
    const y = 150 - (value / maxValue) * 115;
    return [x, y];
  });
}

export default function BillingRevenueChart() {
  const max = Math.max(...BILLING_REVENUE_SERIES.starter, ...BILLING_REVENUE_SERIES.professional, ...BILLING_REVENUE_SERIES.business) + 5;
  const series = useMemo(() => [
    ['starter', BILLING_REVENUE_SERIES.starter, '#16b9d3'],
    ['professional', BILLING_REVENUE_SERIES.professional, '#665cff'],
    ['business', BILLING_REVENUE_SERIES.business, '#a33ff2'],
  ].map(([id, values, color]) => ({ id, values, color, coords: points(values, max) })), [max]);

  return (
    <section className="admin-billing-chart admin-billing-card">
      <header><div><span>REVENUE MIX</span><h2>Выручка по тарифам</h2><p>Динамика MRR по продуктовым пакетам.</p></div><div className="admin-billing-chart__legend"><span><i className="is-cyan" />Стартер</span><span><i className="is-violet" />Профессионал</span><span><i className="is-magenta" />Бизнес</span></div></header>
      <div className="admin-billing-chart__canvas">
        <svg viewBox="0 0 580 180" preserveAspectRatio="none" role="img" aria-label="Выручка по тарифам">
          {[42,84,126].map((y) => <line key={y} x1="20" y1={y} x2="560" y2={y} stroke="#edf0f7" strokeDasharray="3 7" />)}
          {series.map((item, seriesIndex) => <polyline key={item.id} className="admin-billing-chart__line" style={{ '--line-index': seriesIndex }} points={item.coords.map(([x,y]) => `${x},${y}`).join(' ')} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
          {series.map((item) => item.coords.map(([x,y], index) => <circle key={`${item.id}-${index}`} cx={x} cy={y} r="3.5" fill="#fff" stroke={item.color} strokeWidth="2"><title>{BILLING_REVENUE_SERIES.labels[index]}: {item.values[index]} тыс. ₽</title></circle>))}
        </svg>
        <div>{BILLING_REVENUE_SERIES.labels.map((label) => <span key={label}>{label}</span>)}</div>
      </div>
    </section>
  );
}
