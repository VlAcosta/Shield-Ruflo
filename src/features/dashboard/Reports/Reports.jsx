import React, { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import PeriodMenu from '../../../components/ui/PeriodMenu';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import './Reports.scss';

const PERIOD_OPTIONS = Object.freeze([
  { value: 'month', label: 'Месяц', caption: 'Последние 30 дней' },
  { value: 'quarter', label: 'Квартал', caption: 'Последние 3 месяца' },
]);
function DocumentIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.75H14.25L18.25 7.75V20.25H7V3.75Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round"/><path d="M14 4V8H18" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round"/><path d="M9.5 12H15.5M9.5 15.5H14" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round"/></svg>}
function ArrowIcon(){return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3.75L9.25 8L5 12.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}

function Reports(){
  const navigate=useNavigate();
  const [period,setPeriod]=useState('month');
  const [activeId,setActiveId]=useState(null);
  const { section,status,refresh }=useDashboardData('reports');
  const reports=Array.isArray(section?.[period])?section[period]:[];
  const currentActiveId=activeId||reports[0]?.id||null;
  const handlePeriodChange=useCallback((next)=>{setPeriod(next);setActiveId(null)},[]);
  const handleOpen=useCallback((reportId)=>{setActiveId(reportId);navigate('/reports')},[navigate]);
  return <DashboardCard title="Отчёты" action={<PeriodMenu value={period} options={PERIOD_OPTIONS} onChange={handlePeriodChange} ariaLabel="Период отчётов" variant="quiet"/>} className="dashboard-reports" motion="scale">
    {status==='loading'&&!section?<DashboardWidgetState type="loading"/>:status==='error'&&!section?<DashboardWidgetState type="error" onRetry={refresh}/>:!reports.length?<DashboardWidgetState title="Отчётов пока нет" text="Сформируйте первый отчёт — последние версии появятся на рабочей доске."/>:<>
      <div className="dashboard-reports__summary"><div><strong>{reports.length}</strong><span>доступно</span></div><button type="button" onClick={()=>navigate('/reports')}>Все отчёты <ArrowIcon/></button></div>
      <div className="dashboard-reports__list">{reports.slice(0,4).map((report,index)=><button type="button" className={`dashboard-reports__item ${currentActiveId===report.id?'is-active':''}`} key={report.id} onMouseEnter={()=>setActiveId(report.id)} onMouseLeave={()=>setActiveId(null)} onFocus={()=>setActiveId(report.id)} onBlur={()=>setActiveId(null)} onClick={()=>handleOpen(report.id)} style={{'--report-index':index}}><span className={`dashboard-reports__icon is-${report.tone||'gray'}`}><DocumentIcon/></span><span className="dashboard-reports__copy"><strong>{report.title}</strong><small>{report.date} · {report.size}</small></span><span className={`dashboard-reports__status is-${report.tone||'gray'}`}>{report.status}</span><span className="dashboard-reports__arrow"><ArrowIcon/></span></button>)}</div>
    </>}
  </DashboardCard>
}
export default memo(Reports);
