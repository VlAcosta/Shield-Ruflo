import React from 'react';

export default function RecommendationStack({ items = [], onCreateAutomation }) {
  return <div className="rep-recommendations">{items.length ? items.map((item, index) => <article key={item.id} style={{ '--delay': `${index * 70}ms` }}><span className={`rep-priority is-${item.priority?.toLowerCase()}`}>{item.priority}</span><div><strong>{item.title}</strong><p>{item.text}</p></div>{item.template && onCreateAutomation ? <button type="button" onClick={() => onCreateAutomation(item.template)}>Автоматизировать <span>→</span></button> : null}</article>) : <div className="rep-empty"><strong>Критичных рекомендаций нет</strong><span>Продолжайте следить за динамикой площадок и SLA.</span></div>}</div>;
}
