import React, { memo, useMemo, useState } from 'react';
import { ArrowIcon, CalendarIcon, MessageIcon, PaperclipIcon } from '../model/icons';
import { getPriorityMeta, getStatusMeta } from '../model/taskData';
import './TaskList.scss';

const SORTS = Object.freeze({
  due: 'dueDate',
  priority: 'priority',
});

const PRIORITY_WEIGHT = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

function dateWeight(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const [day, month, year] = value.split('.').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).getTime();
}

function TaskList({ tasks, onOpen }) {
  const [sort, setSort] = useState('due');
  const [direction, setDirection] = useState('asc');

  const sorted = useMemo(() => {
    const items = [...tasks];
    const factor = direction === 'asc' ? 1 : -1;

    items.sort((a, b) => {
      if (sort === 'priority') {
        return ((PRIORITY_WEIGHT[a.priority] || 0) - (PRIORITY_WEIGHT[b.priority] || 0)) * -factor;
      }
      return (dateWeight(a.dueDate) - dateWeight(b.dueDate)) * factor;
    });
    return items;
  }, [direction, sort, tasks]);

  const toggleSort = (nextSort) => {
    if (sort === nextSort) {
      setDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSort(nextSort);
    setDirection('asc');
  };

  if (!sorted.length) {
    return (
      <section className="task-list__empty">
        <strong>Ничего не найдено</strong>
        <p>Попробуйте изменить поиск или фильтры.</p>
      </section>
    );
  }

  return (
    <section className="task-list">
      <div className="task-list__head" aria-hidden="true">
        <span>Задача</span>
        <span>Тип</span>
        <button type="button" onClick={() => toggleSort('priority')}>Приоритет {sort === 'priority' ? (direction === 'asc' ? '↑' : '↓') : ''}</button>
        <span>Статус</span>
        <button type="button" onClick={() => toggleSort('due')}>Дата {sort === 'due' ? (direction === 'asc' ? '↑' : '↓') : ''}</button>
        <span />
      </div>

      <div className="task-list__rows">
        {sorted.map((task, index) => {
          const priority = getPriorityMeta(task.priority);
          const status = getStatusMeta(task.status);

          return (
            <article className="task-list__row" key={task.id} style={{ '--row-index': index }}>
              <button type="button" className="task-list__primary" onClick={() => onOpen(task.id)}>
                <span className={`task-list__mark task-list__mark--${status.tone}`} />
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    <span><MessageIcon />{task.comments?.length || 0}</span>
                    {task.attachments?.length ? <span><PaperclipIcon />{task.attachments.length}</span> : null}
                  </small>
                </span>
              </button>

              <span className="task-list__type">{task.type}</span>
              <span><i className={`task-list__priority task-list__priority--${priority.tone}`}>{priority.label}</i></span>
              <span><i className={`task-list__status task-list__status--${status.tone}`}><b />{status.label}</i></span>
              <span className="task-list__date"><CalendarIcon />{task.dueDate}</span>

              <button type="button" className="task-list__open" onClick={() => onOpen(task.id)} aria-label={`Открыть ${task.title}`}>
                <ArrowIcon />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default memo(TaskList);
