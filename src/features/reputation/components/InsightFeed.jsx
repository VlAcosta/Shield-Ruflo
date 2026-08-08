import React from 'react';

export default function InsightFeed({ insights = [], onAction }) {
  if (!insights.length) return <div className="rep-empty"><strong>Сигналов пока нет</strong><span>Когда накопится история, Бизнес Щит начнёт объяснять причины изменений.</span></div>;
  return <div className="rep-insights">{insights.map((item, index) => <article key={item.id} className={`rep-insight is-${item.tone || 'violet'}`} style={{ '--delay': `${index * 55}ms` }}><span className="rep-insight__index">0{index + 1}</span><div><strong>{item.title}</strong><p>{item.text}</p></div>{item.action ? <button type="button" onClick={() => onAction(item)}>{item.action}<span>→</span></button> : null}</article>)}</div>;
}
