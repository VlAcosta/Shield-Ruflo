import React from 'react';

export default function ReasonMomentum({ reasons = [] }) {
  const max = Math.max(1, ...reasons.map((item) => item.count));
  return <div className="rep-reasons">{reasons.length ? reasons.map((item, index) => <div className="rep-reason" key={item.reason}><span className="rep-reason__rank">{String(index + 1).padStart(2, '0')}</span><div className="rep-reason__body"><div><strong>{item.reason}</strong><span>{item.count} упоминаний</span></div><div className="rep-reason__track"><i style={{ width: `${(item.count / max) * 100}%`, '--delay': `${index * 70}ms` }} /></div></div><em className={item.delta > 0 ? 'is-up' : item.delta < 0 ? 'is-down' : ''}>{item.delta > 0 ? '+' : ''}{item.delta}%</em></div>) : <div className="rep-empty"><strong>Причины ещё не определены</strong><span>AI-классификация появится после первых негативных отзывов.</span></div>}</div>;
}
