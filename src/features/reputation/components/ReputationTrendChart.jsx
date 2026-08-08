import React, { useMemo, useState } from 'react';

function pointsFor(values, width, height, min, max) {
  const range = Math.max(.01, max - min);
  return values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return [x, y];
  });
}

export default function ReputationTrendChart({ data = [] }) {
  const [active, setActive] = useState(-1);
  const width = 760;
  const height = 220;
  const values = data.map((item) => Number(item.rating || 0)).filter((value) => value > 0);
  const min = Math.max(1, Math.min(...(values.length ? values : [4])) - .25);
  const max = Math.min(5, Math.max(...(values.length ? values : [5])) + .25);
  const points = useMemo(() => pointsFor(data.map((item) => Number(item.rating || min)), width, height, min, max), [data, min, max]);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = points.length ? `${path} L ${width} ${height} L 0 ${height} Z` : '';

  return (
    <div className="rep-trend">
      <svg viewBox={`0 0 ${width} ${height + 30}`} role="img" aria-label="Динамика рейтинга">
        <defs>
          <linearGradient id="repTrendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".24" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, .25, .5, .75, 1].map((step) => <line key={step} x1="0" x2={width} y1={height * step} y2={height * step} className="rep-trend__grid" />)}
        {area ? <path d={area} className="rep-trend__area" /> : null}
        {path ? <path d={path} pathLength="1" className="rep-trend__line" /> : null}
        {points.map(([x, y], index) => (
          <g key={data[index]?.date || index} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(-1)} onFocus={() => setActive(index)} onBlur={() => setActive(-1)} tabIndex="0">
            <circle cx={x} cy={y} r="12" fill="transparent" />
            <circle cx={x} cy={y} r="4.2" className="rep-trend__point" />
            {active === index ? <g className="rep-trend__tooltip"><rect x={Math.min(width - 118, Math.max(0, x - 56))} y={Math.max(4, y - 62)} width="118" height="44" rx="12" /><text x={Math.min(width - 106, Math.max(12, x - 44))} y={Math.max(22, y - 44)}>{data[index].rating || '—'} ★</text><text x={Math.min(width - 106, Math.max(12, x - 44))} y={Math.max(38, y - 28)}>{data[index].count} отзывов</text></g> : null}
          </g>
        ))}
        {data.filter((_, index) => index % Math.max(1, Math.ceil(data.length / 6)) === 0 || index === data.length - 1).map((item) => {
          const index = data.indexOf(item); const x = points[index]?.[0] || 0;
          return <text key={`${item.date}-label`} x={x} y={height + 24} textAnchor={x < 20 ? 'start' : x > width - 20 ? 'end' : 'middle'} className="rep-trend__label">{item.label}</text>;
        })}
      </svg>
    </div>
  );
}
