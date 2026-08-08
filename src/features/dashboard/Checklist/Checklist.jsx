import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import DashboardCard from '../../../components/ui/DashboardCard';
import Button from '../../../components/ui/Button';
import Badge from '../../../components/ui/Badge';
import DashboardWidgetState from '../components/DashboardWidgetState';
import ChecklistCreateModal from './components/ChecklistCreateModal';
import { createTask, getTasksSnapshot, updateTask } from '../../../services/tasks/taskService';
import { getPriorityMeta } from '../../tasks/model/taskData';
import './Checklist.scss';

const FILTERS = [{ value: 'all', label: 'Все' }, { value: 'open', label: 'В работе' }, { value: 'done', label: 'Готово' }];
const priorityByLabel = { 'Без приоритета': 'low', 'Нет': 'low', 'Низкий': 'low', 'Средний': 'medium', 'Высокий': 'high', 'Критический': 'critical' };

function formatTask(task) {
  const priority = getPriorityMeta(task.priority || 'medium');
  return {
    ...task,
    done: task.status === 'done',
    priorityLabel: priority.label,
    tone: priority.tone,
    owner: task.assignee?.name || task.owner || 'Команда',
    date: task.dueDate || 'Без срока',
  };
}

function Checklist() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const tasks = useMemo(() => (snapshot?.tasks || []).map(formatTask).slice(0, 8), [snapshot]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSnapshot(await getTasksSnapshot()); }
    catch (nextError) { setError(nextError?.message || 'Не удалось загрузить задачи'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completedCount = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);
  const completion = Math.round((completedCount / Math.max(1, tasks.length)) * 100);
  const visibleTasks = useMemo(() => filter === 'open' ? tasks.filter((task) => !task.done) : filter === 'done' ? tasks.filter((task) => task.done) : tasks, [filter, tasks]);

  const toggleTask = useCallback(async (taskId) => {
    if (!snapshot) return;
    const task = snapshot.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const previous = snapshot;
    const optimistic = { ...snapshot, tasks: snapshot.tasks.map((item) => item.id === taskId ? { ...item, status: item.status === 'done' ? 'progress' : 'done' } : item) };
    setSnapshot(optimistic);
    try {
      const result = await updateTask(taskId, { status: task.status === 'done' ? 'progress' : 'done' }, previous);
      if (result?.snapshot) setSnapshot(result.snapshot);
    } catch (nextError) {
      setSnapshot(previous);
      setError(nextError?.message || 'Не удалось обновить задачу');
    }
  }, [snapshot]);

  const createChecklistTask = useCallback(async (formTask) => {
    if (!snapshot) return;
    const priority = formTask.priorityId && formTask.priorityId !== 'none' ? formTask.priorityId : priorityByLabel[formTask.priority] || 'low';
    const payload = {
      title: formTask.title,
      type: 'Мониторинг',
      priority,
      status: 'new',
      dueDate: formTask.date,
      description: formTask.note || '',
      owner: formTask.owner,
      checklist: [], comments: [], attachments: [],
    };
    try {
      const result = await createTask(payload, snapshot);
      if (result?.snapshot) setSnapshot(result.snapshot);
      setFilter('all');
    } catch (nextError) { setError(nextError?.message || 'Не удалось создать задачу'); }
  }, [snapshot]);

  return <>
    <DashboardCard title="Чек лист" eyebrow="Контроль исполнения" action={<Button size="sm" onClick={() => setCreateOpen(true)} disabled={loading}>+ Создать</Button>} className="dashboard-checklist" motion="left">
      {loading && !snapshot ? <DashboardWidgetState type="loading" /> : error && !snapshot ? <DashboardWidgetState type="error" text={error} onRetry={load} /> : !tasks.length ? <DashboardWidgetState title="Чек-лист пуст" text="Создайте первую задачу — она попадёт и в общий раздел задач, без отдельной копии данных." /> : <>
        <div className="dashboard-checklist__toolbar"><div className="dashboard-checklist__progress-copy"><strong>{completedCount}/{tasks.length}</strong><span>выполнено</span><i><b style={{ width: `${completion}%` }} /></i></div><div className="dashboard-checklist__filters" role="tablist" aria-label="Фильтр задач">{FILTERS.map((item)=><button type="button" role="tab" aria-selected={filter===item.value} className={filter===item.value?'is-active':''} onClick={()=>setFilter(item.value)} key={item.value}>{item.label}</button>)}</div></div>
        {error ? <div className="dashboard-checklist__inline-error">{error}</div> : null}
        <div className="dashboard-checklist__table" role="table" aria-label="Чек лист задач"><div className="dashboard-checklist__row dashboard-checklist__row--head" role="row"><span>Задача</span><span>Приоритет</span><span>Кто</span><span>Дата</span></div>{visibleTasks.map((task)=><div className={`dashboard-checklist__row ${task.done?'is-done':''}`} role="row" key={task.id}><button className="dashboard-checklist__task" type="button" onClick={()=>toggleTask(task.id)} aria-pressed={task.done} title={task.description||''}><span className={`dashboard-checklist__checkbox ${task.done?'is-checked':''}`}>{task.done?'✓':''}</span><span>{task.title}</span></button><span><Badge tone={task.tone}>{task.priorityLabel}</Badge></span><span className="dashboard-checklist__muted">{task.owner}</span><span className="dashboard-checklist__muted">{task.date}</span></div>)}{!visibleTasks.length?<div className="dashboard-checklist__empty">В этой категории пока нет задач</div>:null}</div>
      </>}
    </DashboardCard>
    <ChecklistCreateModal open={createOpen} onClose={()=>setCreateOpen(false)} onCreate={createChecklistTask}/>
  </>;
}
export default memo(Checklist);
