import React, { useMemo, useState } from 'react';
import TaskBoard from '../TaskBoard';
import TaskList from '../TaskList';
import TaskDetails from '../TaskDetails';
import TaskCreateModal from '../TaskCreateModal';
import useTasks from '../hooks/useTasks';
import { BoardIcon, ListIcon, PlusIcon, SearchIcon } from '../model/icons';
import { TASK_PRIORITIES } from '../model/taskData';
import './TasksWorkspace.scss';
import useAccessControl from '../../access/hooks/useAccessControl';

export default function TasksWorkspace() {
  const tasks = useTasks();
  const access = useAccessControl();
  const canCreate = access.can('tasks.create');
  const canEdit = access.can('tasks.edit');
  const canCreateConfirmed = canCreate && tasks.serverConfirmed;
  const canEditConfirmed = canEdit && tasks.serverConfirmed;
  const taskTypes = useMemo(
    () => Array.from(new Set((tasks.snapshot?.tasks || []).map((item) => item.type).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
    [tasks.snapshot?.tasks],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState('new');

  const openCreate = (status = 'new') => {
    if (!canCreateConfirmed) return;
    setCreateStatus(status);
    setCreateOpen(true);
  };

  if (tasks.loading) {
    return (
      <div className="tasks-skeleton" aria-label="Загрузка задач">
        <span className="tasks-skeleton__toolbar" />
        <div className="tasks-skeleton__columns">
          <span/><span/><span/><span/>
        </div>
      </div>
    );
  }

  if (tasks.error || !tasks.snapshot) {
    return (
      <section className="tasks-error">
        <span>!</span>
        <div>
          <h2>Задачи временно недоступны</h2>
          <p>{tasks.error || 'Не удалось получить данные.'}</p>
        </div>
        <button type="button" onClick={tasks.reload}>Повторить</button>
      </section>
    );
  }

  return (
    <div className="tasks-workspace">
      <section className="tasks-workspace__toolbar">
        <label className="tasks-workspace__search">
          <SearchIcon />
          <input value={tasks.query} onChange={(event) => tasks.setQuery(event.target.value)} placeholder="Поиск задач..." />
        </label>

        <div className="tasks-workspace__filters">
          <label className="tasks-workspace__select">
            <select value={tasks.priority} onChange={(event) => tasks.setPriority(event.target.value)} aria-label="Фильтр по приоритету">
              <option value="all">Все приоритеты</option>
              {TASK_PRIORITIES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>

          <label className="tasks-workspace__select tasks-workspace__select--type">
            <select value={tasks.type} onChange={(event) => tasks.setType(event.target.value)} aria-label="Фильтр по типу задачи">
              <option value="all">Все типы</option>
              {taskTypes.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="tasks-workspace__view" aria-label="Вид задач">
          <button type="button" className={tasks.view === 'board' ? 'is-active' : ''} onClick={() => tasks.setView('board')} aria-label="Канбан">
            <BoardIcon />
          </button>
          <button type="button" className={tasks.view === 'list' ? 'is-active' : ''} onClick={() => tasks.setView('list')} aria-label="Список">
            <ListIcon />
          </button>
        </div>

        <button type="button" className="tasks-workspace__create" onClick={() => openCreate('new')} disabled={!canCreateConfirmed} title={!canCreate ? 'Нет права создавать задачи' : !tasks.serverConfirmed ? 'Сервер не подтвердил актуальное состояние задач' : undefined}>
          <PlusIcon />
          <span>{canCreate ? (tasks.serverConfirmed ? 'Создать' : 'Сервер недоступен') : 'Только просмотр'}</span>
        </button>
      </section>

      {tasks.stale ? (
        <section className="tasks-truth-warning" role="alert">
          <div><strong>Показаны сохранённые задачи</strong><span>Сервер не подтвердил актуальное состояние. Изменения временно заблокированы, чтобы локальный cache не перезаписал свежие данные команды.</span></div>
          <button type="button" onClick={tasks.reload}>Проверить сервер</button>
        </section>
      ) : null}

      <div className="tasks-workspace__summary" aria-label="Сводка по задачам">
        <span><strong>{tasks.snapshot.tasks.length}</strong> всего</span>
        <span><i className="is-new"/><strong>{tasks.snapshot.tasks.filter((item) => item.status === 'new').length}</strong> новых</span>
        <span><i className="is-progress"/><strong>{tasks.snapshot.tasks.filter((item) => item.status === 'progress').length}</strong> в работе</span>
        <span><i className="is-done"/><strong>{tasks.snapshot.tasks.filter((item) => item.status === 'done').length}</strong> готово</span>
      </div>

      {tasks.view === 'board' ? (
        <TaskBoard
          columns={tasks.columns}
          onOpen={tasks.setSelectedTaskId}
          onMove={tasks.moveTask}
          onCreate={openCreate}
          canEdit={canEditConfirmed}
          canCreate={canCreateConfirmed}
        />
      ) : (
        <TaskList tasks={tasks.filteredTasks} onOpen={tasks.setSelectedTaskId} />
      )}

      <TaskDetails
        task={tasks.selectedTask}
        busy={tasks.busy.taskId === tasks.selectedTask?.id}
        onClose={() => tasks.setSelectedTaskId(null)}
        onUpdate={tasks.updateTask}
        onToggleChecklist={tasks.toggleChecklist}
        onAddComment={tasks.addComment}
        onAddChecklist={tasks.addChecklist}
        readOnly={!canEditConfirmed}
        canAddChecklist={canCreateConfirmed}
      />

      <TaskCreateModal
        open={createOpen && canCreateConfirmed}
        initialStatus={createStatus}
        busy={tasks.busy.create}
        onClose={() => setCreateOpen(false)}
        onCreate={async (payload) => {
          const created = await tasks.createTask(payload);
          if (created) setCreateOpen(false);
        }}
      />

      {tasks.notice ? (
        <div className={`tasks-toast tasks-toast--${tasks.notice.tone}`} key={tasks.notice.id}>
          <span />{tasks.notice.message}
        </div>
      ) : null}
    </div>
  );
}
