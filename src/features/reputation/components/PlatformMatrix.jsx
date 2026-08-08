import React from 'react';

export default function PlatformMatrix({ items = [] }) {
  return <div className="rep-platforms">{items.map((item) => <article key={item.platform} className={!item.count ? 'is-empty' : ''}><header><strong>{item.platform}</strong><span>{item.count ? `${item.count} отзывов` : 'нет данных'}</span></header><div className="rep-platforms__rating"><b>{item.rating || '—'}</b><small>рейтинг</small><em className={item.ratingDelta >= 0 ? 'is-up' : 'is-down'}>{item.ratingDelta > 0 ? '+' : ''}{item.ratingDelta || 0}</em></div><dl><div><dt>Негатив</dt><dd>{item.negativeShare}%</dd></div><div><dt>Ответы</dt><dd>{item.responseCoverage}%</dd></div><div><dt>Реакция</dt><dd>{item.avgResponseHours ? `${item.avgResponseHours} ч` : '—'}</dd></div></dl><div className="rep-platforms__bar"><i style={{ width: `${Math.max(4, item.responseCoverage)}%` }} /></div></article>)}</div>;
}
