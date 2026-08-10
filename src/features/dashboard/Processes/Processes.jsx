import React, { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import Badge from '../../../components/ui/Badge';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import './Processes.scss';

function PlusIcon(){return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}

function Processes(){
  const navigate=useNavigate();
  const { section,status,refresh }=useDashboardData('processes');
  const processes=useMemo(()=>Array.isArray(section)?section:[],[section]);
  const completed=useMemo(()=>processes.filter((item)=>Number(item.progress)>=100).length,[processes]);
  const averageProgress=useMemo(()=>processes.length?Math.round(processes.reduce((sum,item)=>sum+Number(item.progress||0),0)/processes.length):0,[processes]);
  return <DashboardCard title="Процессы" eyebrow="OPERATIONS" action={<button type="button" className="dashboard-processes__create" onClick={()=>navigate('/tasks')}><PlusIcon/> Создать</button>} className="dashboard-processes" motion="left">
    {status==='loading'&&!section?<DashboardWidgetState type="loading"/>:status==='error'&&!section?<DashboardWidgetState type="error" onRetry={refresh}/>:!processes.length?<DashboardWidgetState title="Процессов пока нет" text="Рабочие процессы формируются из задач и их статусов. Создайте первую задачу, чтобы увидеть прогресс."/>:<>
      <div className="dashboard-processes__overview"><div className="dashboard-processes__ring" style={{'--process-progress':`${averageProgress*3.6}deg`}}><div><strong>{averageProgress}%</strong><span>в среднем</span></div></div><div className="dashboard-processes__overview-copy"><span>Состояние процессов</span><strong>{completed} из {processes.length} завершено</strong><small>{processes.some((item)=>Number(item.progress)<30)?'Есть процессы, которым нужно внимание':'Рабочий контур движется без критических блокировок'}</small></div></div>
      <div className="dashboard-processes__list">{processes.map((process,index)=><article className={`dashboard-processes__item is-${process.tone||'violet'}`} style={{'--process-index':index,'--process-width':`${Math.max(0,Math.min(100,Number(process.progress||0)))}%`}} key={process.id}><span className="dashboard-processes__rail" aria-hidden="true"><i/></span><div className="dashboard-processes__item-copy"><div className="dashboard-processes__top"><strong>{process.title}</strong><Badge tone={process.badge||'neutral'}>{process.status||'В работе'}</Badge></div><div className="dashboard-processes__meta"><span>{process.date||'—'}</span><strong>{Math.round(Number(process.progress||0))}%</strong></div></div></article>)}</div>
    </>}
  </DashboardCard>
}
export default memo(Processes);
