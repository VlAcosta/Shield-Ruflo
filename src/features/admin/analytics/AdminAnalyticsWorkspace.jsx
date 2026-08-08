import React, { useMemo, useState } from 'react';
import useAdminAnalytics from './hooks/useAdminAnalytics';
import './AdminAnalyticsWorkspace.scss';

const PERIODS = [
  ['month','Месяц'],
  ['quarter','Квартал'],
  ['year','Год'],
];

function Sparkline({ values, color = '#665cff', fillId = 'sparkFill' }) {
  const max = Math.max(...values); const min = Math.min(...values);
  const pts = values.map((value,index) => {
    const x = 6 + index * (188 / Math.max(1, values.length - 1));
    const y = 58 - ((value - min) / Math.max(1, max - min)) * 40;
    return [x,y];
  });
  const line = pts.map(([x,y]) => `${x},${y}`).join(' ');
  const area = `6,64 ${line} 194,64`;
  return <svg viewBox="0 0 200 70" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".18"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs><polygon points={area} fill={`url(#${fillId})`} /><polyline className="admin-analytics-sparkline__line" points={line} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function AnalyticsMetric({ item, index, series }) {
  return <article className={`admin-analytics-metric is-${item.tone}`} style={{'--metric-index':index}}><div><span>{item.label}</span><b>{item.direction === 'down' ? '↓' : '↑'} {item.delta}</b></div><strong>{item.value}</strong><div className="admin-analytics-metric__spark"><Sparkline values={series} color={item.tone === 'cyan' ? '#16b9d3' : item.tone === 'green' ? '#17b982' : item.tone === 'magenta' ? '#a33ff2' : '#665cff'} fillId={`metric-${item.id}`} /></div></article>;
}

function MultiLineChart({ title, eyebrow, description, months, lines, legend }) {
  const all = lines.flatMap((line) => line.values);
  const max = Math.max(...all); const min = Math.min(...all);
  const toPoints = (values) => values.map((value,index) => {
    const x = 28 + index * (524 / Math.max(1, values.length - 1));
    const y = 165 - ((value - min) / Math.max(1, max - min)) * 120;
    return [x,y];
  });
  return <section className="admin-analytics-card admin-analytics-chart"><header><div><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><div className="admin-analytics-chart__legend">{legend.map((item) => <span key={item.label}><i style={{background:item.color}} />{item.label}</span>)}</div></header><div className="admin-analytics-chart__canvas"><svg viewBox="0 0 580 190" preserveAspectRatio="none">{[45,85,125,165].map((y) => <line key={y} x1="24" y1={y} x2="556" y2={y} stroke="#eef1f6" strokeDasharray="3 7" />)}{lines.map((line,index) => { const pts = toPoints(line.values); return <g key={line.id}><polyline className="admin-analytics-chart__line" style={{'--line-index':index}} points={pts.map(([x,y]) => `${x},${y}`).join(' ')} fill="none" stroke={line.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{pts.map(([x,y],pointIndex) => <circle key={pointIndex} cx={x} cy={y} r="3.5" fill="#fff" stroke={line.color} strokeWidth="2"><title>{months[pointIndex]}: {line.values[pointIndex]}</title></circle>)}</g>;})}</svg><div>{months.map((month) => <span key={month}>{month}</span>)}</div></div></section>;
}

function BarsChart({ data, months }) {
  const max = Math.max(...data.newClients, ...data.churnClients);
  return <section className="admin-analytics-card admin-analytics-bars"><header><div><span>GROWTH FLOW</span><h2>Новые клиенты vs Отток</h2><p>Динамика притока и ухода по периодам.</p></div></header><div className="admin-analytics-bars__legend"><span><i className="is-new"/>Новые</span><span><i className="is-churn"/>Отток</span></div><div className="admin-analytics-bars__grid">{months.map((month,index) => <div key={month} className="admin-analytics-bars__group" style={{'--bar-index':index}}><div><i className="is-new" style={{height:`${(data.newClients[index]/max)*100}%`}}><b>{data.newClients[index]}</b></i><i className="is-churn" style={{height:`${(data.churnClients[index]/max)*100}%`}}><b>{data.churnClients[index]}</b></i></div><span>{month}</span></div>)}</div></section>;
}

function PlatformTable({ platforms }) {
  return <section className="admin-analytics-card admin-platform-table"><header><div><span>REPUTATION NETWORK</span><h2>Статистика по площадкам</h2><p>Ответы, охват и рейтинг по внешним источникам.</p></div><button type="button" onClick={() => window.print()}>Экспорт</button></header><div className="admin-platform-table__wrap"><table><thead><tr><th>Площадка</th><th>Отзывов</th><th>Ответов</th><th>Охват</th><th>Рейтинг</th><th>Динамика</th></tr></thead><tbody>{platforms.map((platform,index) => <tr key={platform.id} style={{'--row-index':index}}><td><span className={`admin-platform-table__logo is-${platform.id}`}>{platform.name.slice(0,1)}</span><strong>{platform.name}</strong></td><td>{platform.reviews.toLocaleString('ru-RU')}</td><td>{platform.replies.toLocaleString('ru-RU')}</td><td><div className="admin-platform-table__coverage"><span><i style={{width:`${platform.coverage}%`}} /></span><b>{platform.coverage}%</b></div></td><td><strong className="admin-platform-table__rating">★ {platform.rating}</strong></td><td><span className={platform.trend >= 0 ? 'is-positive' : 'is-negative'}>{platform.trend >= 0 ? '↑' : '↓'} {Math.abs(platform.trend)}%</span></td></tr>)}</tbody></table></div></section>;
}

function Skeleton(){return <div className="admin-analytics-skeleton">{Array.from({length:10}).map((_,i)=><i key={i}/>)}</div>;}

export default function AdminAnalyticsWorkspace({ onRefreshReady }) {
  const [period,setPeriod] = useState('month');
  const { data,error,refreshing,refresh } = useAdminAnalytics(period);
  React.useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady,refresh]);

  const metricSeries = useMemo(() => data ? [data.mrr,data.newClients,data.churnRate,data.plans.professional] : [], [data]);
  if (!data && refreshing) return <Skeleton/>;
  if (!data && error) return <section className="admin-analytics-error"><strong>Не удалось загрузить аналитику</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;
  if (!data) return null;

  return <div className={`admin-analytics ${refreshing ? 'is-refreshing':''}`}>
    <section className="admin-analytics__intro"><div><span>INTELLIGENCE LAYER</span><h2>Метрики, которые объясняют движение бизнеса</h2><p>Смотрите рост, отток, тарифную структуру и состояние репутационных каналов без переключения между отчётами.</p></div><div className="admin-analytics__period">{PERIODS.map(([id,label]) => <button key={id} type="button" className={period === id ? 'is-active':''} onClick={()=>setPeriod(id)}>{label}</button>)}</div></section>

    <div className="admin-analytics__metrics">{data.metrics.map((item,index)=><AnalyticsMetric key={item.id} item={item} index={index} series={metricSeries[index]}/>)}</div>

    <div className="admin-analytics__grid">
      <MultiLineChart title="MRR" eyebrow="REVENUE VELOCITY" description="Ежемесячная повторяющаяся выручка, тыс. ₽." months={data.months} lines={[{id:'mrr',values:data.mrr,color:'#665cff'}]} legend={[{label:'MRR',color:'#665cff'}]} />
      <BarsChart data={data} months={data.months}/>
      <MultiLineChart title="Рост по тарифам" eyebrow="PLAN MOMENTUM" description="Как меняется клиентская база по продуктовым пакетам." months={data.months} lines={[{id:'starter',values:data.plans.starter,color:'#16b9d3'},{id:'professional',values:data.plans.professional,color:'#665cff'},{id:'business',values:data.plans.business,color:'#a33ff2'}]} legend={[{label:'Стартер',color:'#16b9d3'},{label:'Профессионал',color:'#665cff'},{label:'Бизнес',color:'#a33ff2'}]} />
      <MultiLineChart title="Churn Rate" eyebrow="RETENTION SIGNAL" description="Доля клиентов, покидающих сервис." months={data.months} lines={[{id:'churn',values:data.churnRate,color:'#17b982'}]} legend={[{label:'Churn %',color:'#17b982'}]} />
    </div>

    <section className="admin-analytics-insights"><header><div><span>SMART INSIGHTS</span><h2>Что стоит заметить</h2></div><small>автоматическая интерпретация</small></header><div>{data.insights.map((insight,index)=><article key={insight.id} className={`is-${insight.tone}`} style={{'--insight-index':index}}><i/><span><strong>{insight.title}</strong><small>{insight.text}</small></span><b>↗</b></article>)}</div></section>

    <PlatformTable platforms={data.platforms}/>
  </div>;
}
