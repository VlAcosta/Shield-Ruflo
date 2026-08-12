import React, { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import PeriodMenu from '../../../components/ui/PeriodMenu';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import './ReviewsChart.scss';

const PERIOD_OPTIONS = Object.freeze([
  { value: 'month', label: 'Месяц', caption: 'Последние 4 недели' },
  { value: 'week', label: 'Неделя', caption: 'Последние 7 дней' },
]);
const VIEWBOX_WIDTH = 700;
const VIEWBOX_HEIGHT = 132;
const CHART_TOP = 12;
const CHART_BOTTOM = 116;
const numberFormatter = new Intl.NumberFormat('ru-RU');

function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="6.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M8 4.8V8M16 4.8V8M5 10H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function ChartIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17V13M12 17V8M17 17V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>; }
function buildPoints(values, maxValue) { const step = values.length > 1 ? VIEWBOX_WIDTH / (values.length - 1) : VIEWBOX_WIDTH; const height = CHART_BOTTOM - CHART_TOP; return values.map((value, index) => ({ x: index * step, y: CHART_BOTTOM - (value / Math.max(1, maxValue)) * height, value })); }
function buildSmoothPath(points) { if (!points.length) return ''; if (points.length === 1) return `M ${points[0].x} ${points[0].y}`; return points.reduce((path, point, index) => { if (index === 0) return `M ${point.x} ${point.y}`; const previous = points[index - 1]; const controlOffset = (point.x - previous.x) * .42; return `${path} C ${previous.x + controlOffset} ${previous.y}, ${point.x - controlOffset} ${point.y}, ${point.x} ${point.y}`; }, ''); }

function ReviewsChart() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [activeIndex, setActiveIndex] = useState(null);
  const { section, status, refresh } = useDashboardData('reviews');
  const data = section?.[period];
  const labels = useMemo(() => (Array.isArray(data?.labels) ? data.labels : []), [data?.labels]);
  const received = useMemo(() => (Array.isArray(data?.received) ? data.received.map(Number) : []), [data?.received]);
  const answered = useMemo(() => (Array.isArray(data?.answered) ? data.answered.map(Number) : []), [data?.answered]);
  const latestIndex = Math.max(0, labels.length - 1);
  const displayIndex = activeIndex ?? latestIndex;
  const hasData = labels.length > 0 && received.some((value) => value > 0);

  const chart = useMemo(() => {
    if (!hasData) return { receivedPoints: [], answeredPoints: [], receivedPath: '', answeredPath: '', areaPath: '' };
    const maxValue = Math.max(...received, ...answered, 1) * 1.08;
    const receivedPoints = buildPoints(received, maxValue);
    const answeredPoints = buildPoints(answered.length === received.length ? answered : received.map(() => 0), maxValue);
    const receivedPath = buildSmoothPath(receivedPoints);
    const answeredPath = buildSmoothPath(answeredPoints);
    return { receivedPoints, answeredPoints, receivedPath, answeredPath, areaPath: `${receivedPath} L ${VIEWBOX_WIDTH} ${CHART_BOTTOM} L 0 ${CHART_BOTTOM} Z` };
  }, [answered, hasData, received]);

  const handleMouseMove = useCallback((event) => { if (!labels.length) return; const bounds = event.currentTarget.getBoundingClientRect(); const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)); setActiveIndex(Math.round(ratio * (labels.length - 1))); }, [labels.length]);
  const handleKeyDown = useCallback((event) => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !labels.length) return; event.preventDefault(); setActiveIndex((current) => { const start = current ?? latestIndex; return Math.max(0, Math.min(latestIndex, start + (event.key === 'ArrowRight' ? 1 : -1))); }); }, [labels.length, latestIndex]);
  const receivedPoint = chart.receivedPoints[displayIndex];
  const answeredPoint = chart.answeredPoints[displayIndex];

  return (
    <DashboardCard className="reviews-chart" motion="left">
      <div className="reviews-chart__meta"><div className="reviews-chart__period-label"><CalendarIcon /><span>Динамика отзывов</span></div><div className="reviews-chart__meta-actions"><PeriodMenu value={period} options={PERIOD_OPTIONS} onChange={(next) => { setPeriod(next); setActiveIndex(null); }} ariaLabel="Период графика отзывов" /><span className="reviews-chart__chart-icon"><ChartIcon /></span></div></div>
      {status === 'loading' && !section ? <DashboardWidgetState type="loading" /> : status === 'error' && !section ? <DashboardWidgetState type="error" onRetry={refresh} /> : !hasData ? <DashboardWidgetState title="Отзывов пока нет" text="Подключите площадку — после первой синхронизации здесь появится динамика новых отзывов и ответов." actionLabel="Подключить площадку" onAction={() => navigate('/integrations')} /> : <>
        <div className="reviews-chart__summary"><div><strong className="reviews-chart__value">+ {numberFormatter.format(Number(data?.total ?? received.reduce((sum, value) => sum + value, 0)))}</strong><div className="reviews-chart__growth"><strong>{Number(data?.growth || 0) >= 0 ? '↑' : '↓'} {Number(data?.growth || 0) > 0 ? '+' : ''}{Number(data?.growth || 0)}%</strong><span>изменение за период</span></div></div><div className="reviews-chart__legend" aria-label="Легенда графика"><span><i className="is-received" />Новые отзывы</span><span><i className="is-answered" />Ответы</span></div></div>
        <div className="reviews-chart__visual" role="img" tabIndex="0" aria-label={`Динамика отзывов${labels[displayIndex] ? `. ${labels[displayIndex]}: ${received[displayIndex] || 0} новых отзывов` : ''}`} onMouseMove={handleMouseMove} onMouseLeave={() => setActiveIndex(null)} onFocus={() => setActiveIndex((current) => current ?? latestIndex)} onBlur={() => setActiveIndex(null)} onKeyDown={handleKeyDown}>
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="reviewsAreaStage4" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6b63f6" stopOpacity=".16" /><stop offset="100%" stopColor="#6b63f6" stopOpacity="0" /></linearGradient></defs>{[.25,.5,.75].map((ratio)=><line className="reviews-chart__grid-line" key={ratio} x1="0" x2={VIEWBOX_WIDTH} y1={CHART_TOP+(CHART_BOTTOM-CHART_TOP)*ratio} y2={CHART_TOP+(CHART_BOTTOM-CHART_TOP)*ratio}/>) }<path className="reviews-chart__area" d={chart.areaPath}/><path className="reviews-chart__line reviews-chart__line--primary" d={chart.receivedPath}/><path className="reviews-chart__line reviews-chart__line--secondary" d={chart.answeredPath}/>{chart.receivedPoints.map((point,index)=><g key={`${period}-${index}`}>{activeIndex!==null&&index===displayIndex?<line className="reviews-chart__cursor" x1={point.x} x2={point.x} y1={CHART_TOP} y2={CHART_BOTTOM}/>:null}<circle className={`reviews-chart__point reviews-chart__point--primary ${activeIndex!==null&&index===displayIndex?'is-active':''}`} cx={point.x} cy={point.y} r={activeIndex!==null&&index===displayIndex?4.2:2.3}/><circle className={`reviews-chart__point reviews-chart__point--secondary ${activeIndex!==null&&index===displayIndex?'is-active':''}`} cx={chart.answeredPoints[index]?.x||point.x} cy={chart.answeredPoints[index]?.y||CHART_BOTTOM} r={activeIndex!==null&&index===displayIndex?3.6:2}/></g>)}</svg>
          {activeIndex!==null&&receivedPoint?<div className={`reviews-chart__tooltip ${displayIndex===0?'is-start':displayIndex===latestIndex?'is-end':''}`} style={{'--tooltip-x':`${(receivedPoint.x/VIEWBOX_WIDTH)*100}%`}} aria-hidden="true"><strong>{labels[displayIndex]}</strong><span><i className="is-received" />{numberFormatter.format(receivedPoint.value)} отзывов</span><span><i className="is-answered" />{numberFormatter.format(answeredPoint?.value||0)} ответов</span></div>:null}
          <div className="reviews-chart__months" style={{'--months':labels.length}}>{labels.map((label,index)=><span className={activeIndex!==null&&index===displayIndex?'is-active':''} key={`${label}-${index}`}>{label}</span>)}</div>
        </div>
      </>}
    </DashboardCard>
  );
}
export default memo(ReviewsChart);
