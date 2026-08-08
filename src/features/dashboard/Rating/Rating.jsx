import React, { memo, useCallback, useMemo, useState } from 'react';
import DashboardCard from '../../../components/ui/DashboardCard';
import PeriodMenu from '../../../components/ui/PeriodMenu';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import './Rating.scss';

const PERIODS = Object.freeze([
  { value: 'week', label: 'Неделя', caption: 'Последние 7 дней' },
  { value: 'month', label: 'Месяц', caption: 'Последние 4 недели' },
]);
const CHART_W = 360;
const CHART_H = 108;
function buildPoints(values) { if (!values.length) return []; const min=Math.min(...values)-.02; const max=Math.max(...values)+.015; const range=Math.max(.01,max-min); return values.map((value,index)=>({x:values.length===1?0:(index/(values.length-1))*CHART_W,y:CHART_H-10-((value-min)/range)*(CHART_H-24),value})); }
function buildPath(points) { if (!points.length) return ''; return points.reduce((path,point,index)=>{ if(index===0)return `M ${point.x} ${point.y}`; const previous=points[index-1]; const offset=(point.x-previous.x)*.42; return `${path} C ${previous.x+offset} ${previous.y}, ${point.x-offset} ${point.y}, ${point.x} ${point.y}`;},''); }
function StarIcon(){return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.6L12.25 7.15L17.3 7.88L13.65 11.44L14.51 16.46L10 14.09L5.49 16.46L6.35 11.44L2.7 7.88L7.75 7.15L10 2.6Z" fill="currentColor"/></svg>}

function Rating(){
  const [period,setPeriod]=useState('week');
  const [activeIndex,setActiveIndex]=useState(null);
  const { section,status,refresh }=useDashboardData('rating');
  const data=section?.[period];
  const values=Array.isArray(data?.values)?data.values.map(Number).filter(Number.isFinite):[];
  const labels=Array.isArray(data?.labels)?data.labels:[];
  const hasData=Number(data?.current)>0&&values.length>0;
  const points=useMemo(()=>buildPoints(values),[values]);
  const path=useMemo(()=>buildPath(points),[points]);
  const scorePercent=Math.round((Number(data?.current||0)/5)*100);
  const displayIndex=activeIndex??Math.max(0,points.length-1);
  const display=points[displayIndex];
  const handlePointerMove=useCallback((event)=>{if(!points.length)return;const rect=event.currentTarget.getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));setActiveIndex(Math.round(ratio*(points.length-1)));},[points.length]);
  const statusLabel=scorePercent>=90?'Отличная':scorePercent>=80?'Хорошая':scorePercent>=65?'Стабильная':'Требует внимания';

  return <DashboardCard title="Общий рейтинг" action={<PeriodMenu value={period} options={PERIODS} onChange={(next)=>{setPeriod(next);setActiveIndex(null);}} ariaLabel="Период рейтинга"/>} className="dashboard-rating" motion="right">
    {status==='loading'&&!section?<DashboardWidgetState type="loading"/>:status==='error'&&!section?<DashboardWidgetState type="error" onRetry={refresh}/>:!hasData?<DashboardWidgetState title="Рейтинг ещё не рассчитан" text="После получения оценок с подключённых площадок здесь появится единый рейтинг и его динамика."/>:<>
      <div className="dashboard-rating__overview"><div className="dashboard-rating__gauge" style={{'--rating-score':`${scorePercent*3.6}deg`}}><div className="dashboard-rating__gauge-inner"><span className="dashboard-rating__star"><StarIcon/></span><strong>{Number(data.current).toFixed(2)}</strong><small>из 5.0</small></div></div><div className="dashboard-rating__summary"><span>Репутационный статус</span><strong>{statusLabel}</strong><p><b>{Number(data.growth||0)>=0?'↑':'↓'} {Number(data.growth||0)>0?'+':''}{Number(data.growth||0)}%</b> за выбранный период</p><small>{Number(data.reviews||0).toLocaleString('ru-RU')} оценок учтено</small></div><div className="dashboard-rating__health"><div><span>Позитив</span><strong>{Math.round(Number(data.positive||0))}%</strong></div><i><b style={{width:`${Math.max(0,Math.min(100,Number(data.positive||0)))}%`}}/></i><div><span>Ответы</span><strong>{Math.round(Number(data.answered||0))}%</strong></div><i><b style={{width:`${Math.max(0,Math.min(100,Number(data.answered||0)))}%`}}/></i></div></div>
      <div className="dashboard-rating__chart-shell"><div className="dashboard-rating__chart-title"><div><span>Динамика оценки</span><strong>{Number(data.growth||0)>=0?'Положительная динамика':'Есть снижение'}</strong></div><small>Наведите на график для деталей</small></div><div className="dashboard-rating__chart" role="img" tabIndex="0" aria-label={`Динамика рейтинга. Текущий рейтинг ${Number(data.current).toFixed(2)}`} onMouseMove={handlePointerMove} onMouseLeave={()=>setActiveIndex(null)} onFocus={()=>setActiveIndex(points.length-1)} onBlur={()=>setActiveIndex(null)}><svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="ratingAreaA16" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5a20a" stopOpacity=".2"/><stop offset="100%" stopColor="#f5a20a" stopOpacity="0"/></linearGradient></defs>{[.33,.66].map((ratio)=><line key={ratio} className="dashboard-rating__gridline" x1="0" x2={CHART_W} y1={CHART_H*ratio} y2={CHART_H*ratio}/>)}<path className="dashboard-rating__area" d={`${path} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`}/><path className="dashboard-rating__line" d={path}/>{points.map((point,index)=><circle className={`dashboard-rating__point ${activeIndex!==null&&index===displayIndex?'is-active':''}`} cx={point.x} cy={point.y} r={activeIndex!==null&&index===displayIndex?3.8:2.1} key={`${period}-${index}`}/>)}</svg>{activeIndex!==null&&display?<div className={`dashboard-rating__tooltip ${displayIndex===0?'is-start':displayIndex===points.length-1?'is-end':''}`} style={{'--rating-x':`${(display.x/CHART_W)*100}%`}}><strong>{display.value.toFixed(2)}</strong><span>{labels[displayIndex]||''}</span></div>:null}<div className="dashboard-rating__labels" style={{'--rating-cols':Math.max(1,labels.length)}}>{labels.map((label,index)=><span className={activeIndex!==null&&displayIndex===index?'is-active':''} key={`${label}-${index}`}>{label}</span>)}</div></div></div>
    </>}
  </DashboardCard>
}
export default memo(Rating);
