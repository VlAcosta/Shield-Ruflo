import React, { memo, useCallback, useMemo, useState } from 'react';
import DashboardCard from '../../../components/ui/DashboardCard';
import PeriodMenu from '../../../components/ui/PeriodMenu';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import './TasksChart.scss';

const PERIOD_OPTIONS = Object.freeze([
  { value: 'week', label: 'Неделя', caption: 'Текущие 7 дней' },
  { value: 'month', label: 'Месяц', caption: 'Текущий месяц' },
  { value: 'quarter', label: 'Квартал', caption: 'Последние 3 месяца' },
]);

function ChartIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17V13M12 17V8M17 17V5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>; }

function TasksChart() {
  const [period, setPeriod] = useState('week');
  const [activeId, setActiveId] = useState(null);
  const { section, status, refresh } = useDashboardData('tasks');
  const tasks = Array.isArray(section?.[period]) ? section[period] : [];
  const hasData = tasks.length > 0 && tasks.some((task) => Number(task.total) > 0);

  const summary = useMemo(() => tasks.reduce((acc, task) => ({ total: acc.total + Number(task.total || 0), completed: acc.completed + Number(task.completed || 0), overdue: acc.overdue + Number(task.overdue || 0) }), { total: 0, completed: 0, overdue: 0 }), [tasks]);
  const maxTotal = useMemo(() => Math.max(1, ...tasks.map((task) => Number(task.total || 0))), [tasks]);
  const activeTask = tasks.find((task) => String(task.id) === String(activeId)) || null;
  const completionRate = Math.round((summary.completed / Math.max(1, summary.total)) * 100);
  const handlePeriodChange = useCallback((nextPeriod) => { setPeriod(nextPeriod); setActiveId(null); }, []);

  return (
    <DashboardCard title="Задачи" action={<div className="tasks-chart__header-actions"><PeriodMenu value={period} options={PERIOD_OPTIONS} onChange={handlePeriodChange} ariaLabel="Период статистики задач" /><span className="tasks-chart__head-icon"><ChartIcon /></span></div>} className="tasks-chart" motion="right">
      {status === 'loading' && !section ? <DashboardWidgetState type="loading" /> : status === 'error' && !section ? <DashboardWidgetState type="error" onRetry={refresh} /> : !hasData ? <DashboardWidgetState title="Задач пока нет" text="Создайте первую задачу — здесь появится распределение по направлениям и просрочки." /> : <>
        <div className="tasks-chart__summary"><div className="tasks-chart__completion"><strong>{completionRate}%</strong><span>выполнено за период</span><i><b style={{'--task-progress':`${completionRate}%`}}/></i></div><div className="tasks-chart__summary-stats"><span><strong>{summary.total}</strong> задач</span><span><i className="is-completed"/>{summary.completed} готово</span><span><i className="is-overdue"/>{summary.overdue} просрочено</span></div></div>
        <div className="tasks-chart__bars" aria-label="Распределение задач по направлениям">{tasks.map((task,index)=>{const total=Number(task.total||0);const completed=Number(task.completed||0);const overdue=Number(task.overdue||0);const height=Math.max(18,(total/maxTotal)*100);const completion=Math.round((completed/Math.max(1,total))*100);const active=String(activeId)===String(task.id);return <button className={`tasks-chart__item ${active?'is-active':''}`} type="button" key={`${period}-${task.id}`} aria-label={`${task.label}: ${total} задач, ${completed} выполнено, ${overdue} просрочено`} onMouseEnter={()=>setActiveId(task.id)} onMouseLeave={()=>setActiveId(null)} onFocus={()=>setActiveId(task.id)} onBlur={()=>setActiveId(null)}><span className="tasks-chart__track" style={{'--task-height':`${height}%`,'--task-completion':`${completion}%`,'--task-delay':`${170+index*48}ms`}}><span className={`tasks-chart__bar tasks-chart__bar--${task.tone||'indigo'}`}><span className="tasks-chart__completed"/></span><span className="tasks-chart__tooltip" aria-hidden="true"><strong>{total}</strong><span>{completed} готово</span>{overdue?<em>{overdue} просрочено</em>:<em className="is-clear">без просрочек</em>}</span></span><span className="tasks-chart__label">{task.label}</span></button>;})}</div>
        <div className={`tasks-chart__active ${activeTask?'has-focus':''}`} key={`${period}-${activeTask?.id||'idle'}`}>{activeTask?<><div><span>В фокусе</span><strong>{activeTask.label}</strong></div><div className="tasks-chart__active-metrics"><span><strong>{activeTask.completed}</strong> выполнено</span><span><strong>{Math.max(0,Number(activeTask.total||0)-Number(activeTask.completed||0))}</strong> осталось</span><span className={activeTask.overdue?'is-alert':'is-clear'}><strong>{activeTask.overdue||0}</strong> просрочено</span></div></>:<div className="tasks-chart__idle">Наведите на столбец, чтобы увидеть детали направления</div>}</div>
      </>}
    </DashboardCard>
  );
}
export default memo(TasksChart);
