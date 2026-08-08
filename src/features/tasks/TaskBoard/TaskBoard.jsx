import React, { memo, useMemo, useState } from 'react';
import { ArrowIcon, CalendarIcon, DragIcon, MessageIcon, PaperclipIcon, PlusIcon } from '../model/icons';
import { getPriorityMeta, getStatusMeta } from '../model/taskData';
import './TaskBoard.scss';

function TaskCard({ task, index, onOpen, onDragStart, onDragEnd, onDragOver, onDrop, canEdit }) {
  const priority = getPriorityMeta(task.priority);
  const checklistDone = task.checklist?.filter((item) => item.done).length || 0;
  const checklistTotal = task.checklist?.length || 0;

  return (
    <article
      className="task-board__card"
      onDragOver={(event) => canEdit && onDragOver(event, task.id)}
      onDrop={(event) => canEdit && onDrop(event, task.status, task.id)}
      style={{ '--task-index': index }}
    >
      <div className="task-board__card-top">
        <span className={`task-board__priority task-board__priority--${priority.tone}`}>{priority.label}</span>
        <button
          type="button"
          className="task-board__drag"
          draggable={canEdit}
          disabled={!canEdit}
          onDragStart={(event) => canEdit && onDragStart(event, task.id)}
          onDragEnd={onDragEnd}
          aria-label={`Перетащить ${task.title}`}
          title="Перетащить задачу"
        >
          <DragIcon />
        </button>
      </div>

      <button type="button" className="task-board__open" onClick={() => onOpen(task.id)}>
        <strong>{task.title}</strong>
        <span className="task-board__type">{task.type}</span>

        {checklistTotal ? (
          <span className="task-board__progress" aria-label={`Чек-лист ${checklistDone} из ${checklistTotal}`}>
            <i><b style={{ width: `${Math.round((checklistDone / checklistTotal) * 100)}%` }} /></i>
            <small>{checklistDone}/{checklistTotal}</small>
          </span>
        ) : null}

        <span className="task-board__meta">
          <span><CalendarIcon />{task.dueDate}</span>
          <span><MessageIcon />{task.comments?.length || 0}</span>
          {task.attachments?.length ? <span><PaperclipIcon />{task.attachments.length}</span> : null}
        </span>
      </button>

      <button type="button" className="task-board__arrow" onClick={() => onOpen(task.id)} aria-label={`Открыть ${task.title}`}>
        <ArrowIcon />
      </button>
    </article>
  );
}

function TaskBoard({ columns, onOpen, onMove, onCreate, canEdit = true, canCreate = true }) {
  const [draggedId, setDraggedId] = useState(null);
  const [over, setOver] = useState(null);

  const taskCount = useMemo(
    () => columns.reduce((sum, column) => sum + column.tasks.length, 0),
    [columns],
  );

  const handleDragStart = (event, taskId) => {
    setDraggedId(taskId);
    setOver(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);

    const sourceCard = event.currentTarget.closest('.task-board__card') || event.currentTarget;
    const ghost = sourceCard.cloneNode(true);
    ghost.classList.add('task-board__drag-ghost');
    ghost.style.width = `${sourceCard.getBoundingClientRect().width}px`;
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 32, 24);
    requestAnimationFrame(() => ghost.remove());
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setOver(null);
  };

  const handleDragOver = (event, targetId = null, status = null) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOver({ targetId, status });
  };

  const handleDrop = (event, status, beforeTaskId = null) => {
    event.preventDefault();
    const taskId = draggedId || event.dataTransfer.getData('text/plain');
    if (taskId && taskId !== beforeTaskId) onMove(taskId, status, beforeTaskId);
    handleDragEnd();
  };

  if (!taskCount) {
    return (
      <section className="task-board__empty">
        <span><PlusIcon /></span>
        <strong>Задач по выбранным фильтрам нет</strong>
        <p>Измените фильтры или создайте новую задачу.</p>
        {canCreate ? <button type="button" onClick={() => onCreate('new')}>Создать задачу</button> : null}
      </section>
    );
  }

  return (
    <div className={`task-board ${draggedId ? 'is-dragging' : ''}`}>
      {columns.map(({ status, tasks }) => {
        const meta = getStatusMeta(status);
        const isColumnOver = over?.status === status && !over?.targetId;

        return (
          <section
            className={`task-board__column task-board__column--${meta.tone} ${isColumnOver ? 'is-over' : ''}`}
            key={status}
            onDragOver={(event) => handleDragOver(event, null, status)}
            onDrop={(event) => handleDrop(event, status)}
          >
            <header className="task-board__column-head">
              <div>
                <span className="task-board__status-dot" />
                <h3>{meta.label}</h3>
              </div>
              <span className="task-board__count">{tasks.length}</span>
            </header>

            <div className="task-board__list">
              {tasks.map((task, index) => (
                <div className={over?.targetId === task.id ? 'task-board__drop-target' : ''} key={task.id}>
                  <TaskCard
                    task={task}
                    index={index}
                    onOpen={onOpen}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={(event, taskId) => {
                      handleDragOver(event, taskId, status);
                      event.stopPropagation();
                    }}
                    onDrop={handleDrop}
                    canEdit={canEdit}
                  />
                </div>
              ))}

              {!tasks.length ? (
                <div className="task-board__column-empty">Перетащите задачу сюда</div>
              ) : null}
            </div>

            {canCreate ? <button type="button" className="task-board__add" onClick={() => onCreate(status)}>
              <PlusIcon />
              <span>Добавить</span>
            </button> : null}
          </section>
        );
      })}
    </div>
  );
}

export default memo(TaskBoard);
