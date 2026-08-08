import React, { memo, useEffect, useMemo, useState } from 'react';
import { CalendarIcon, CheckIcon, CloseIcon, FileIcon, MessageIcon, PaperclipIcon, PlusIcon } from '../model/icons';
import { getPriorityMeta, getStatusMeta, TASK_STATUS_ORDER } from '../model/taskData';
import './TaskDetails.scss';

function TaskDetails({ task, busy, onClose, onUpdate, onToggleChecklist, onAddComment, onAddAttachments, readOnly = false }) {
  const [description, setDescription] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    setDescription(task?.description || '');
    setComment('');
  }, [task?.id, task?.description]);

  useEffect(() => {
    if (!task) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, task]);

  const progress = useMemo(() => {
    const total = task?.checklist?.length || 0;
    const done = task?.checklist?.filter((item) => item.done).length || 0;
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }, [task]);

  if (!task) return null;

  const priority = getPriorityMeta(task.priority);
  const status = getStatusMeta(task.status);

  const submitComment = () => {
    if (!comment.trim()) return;
    if (readOnly) return;
    onAddComment(task.id, comment);
    setComment('');
  };

  return (
    <div className="task-details" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-details__dialog" role="dialog" aria-modal="true" aria-labelledby="task-details-title">
        <header className="task-details__head">
          <div className="task-details__head-copy">
            <div className="task-details__tags">
              <span className="task-details__type">{task.type}</span>
              <span className={`task-details__priority task-details__priority--${priority.tone}`}>{priority.label}</span>
            </div>
            <h2 id="task-details-title">{task.title}</h2>
            <div className="task-details__meta">
              <span><CalendarIcon />{task.dueDate}</span>
              <span><MessageIcon />{task.comments?.length || 0} комм.</span>
              {task.attachments?.length ? <span><PaperclipIcon />{task.attachments.length} файла</span> : null}
            </div>
          </div>

          <button type="button" className="task-details__close" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </header>

        <div className="task-details__status-strip">
          <div>
            <small>Статус</small>
            <span className={`task-details__status task-details__status--${status.tone}`}><i />{status.label}</span>
          </div>
          <label>
            <span>Переместить</span>
            <select value={task.status} onChange={(event) => onUpdate(task.id, { status: event.target.value }, 'Статус обновлён')} disabled={busy || readOnly}>
              {TASK_STATUS_ORDER.map((statusId) => <option value={statusId} key={statusId}>{getStatusMeta(statusId).label}</option>)}
            </select>
          </label>
        </div>

        <div className="task-details__body">
          <section className="task-details__section">
            <div className="task-details__section-head">
              <h3>Описание</h3>
              <span>Сохраняется при выходе из поля</span>
            </div>
            <textarea
              className="task-details__description"
              value={description}
              placeholder="Добавьте подробности о задаче..."
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => description !== task.description && onUpdate(task.id, { description }, 'Описание сохранено')}
              disabled={busy || readOnly}
            />
          </section>

          <section className="task-details__section">
            <div className="task-details__section-head">
              <h3>Чек-лист</h3>
              {progress.total ? <span>{progress.done}/{progress.total} · {progress.percent}%</span> : <span>Пока пусто</span>}
            </div>

            {progress.total ? (
              <div className="task-details__check-progress"><span style={{ width: `${progress.percent}%` }} /></div>
            ) : null}

            <div className="task-details__checklist">
              {(task.checklist || []).map((item) => (
                <label className={`task-details__check ${item.done ? 'is-done' : ''}`} key={item.id}>
                  <input type="checkbox" checked={item.done} onChange={() => !readOnly && onToggleChecklist(task.id, item.id)} disabled={busy || readOnly} />
                  <i><CheckIcon /></i>
                  <span>{item.text}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="task-details__section">
            <div className="task-details__section-head">
              <h3>Вложения</h3>
              <span>{task.attachments?.length || 0}</span>
            </div>

            <div className="task-details__files">
              {(task.attachments || []).map((file) => (
                <span className="task-details__file" key={file.id}>
                  <i><FileIcon /></i>
                  <b>{file.name}</b>
                </span>
              ))}

              {!readOnly ? <label className="task-details__file-add">
                <PlusIcon />
                <span>Добавить</span>
                <input
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    if (files.length) onAddAttachments(task.id, files);
                    event.target.value = '';
                  }}
                />
              </label> : null}
            </div>
          </section>

          <section className="task-details__section task-details__section--comments">
            <div className="task-details__section-head">
              <h3>Комментарии</h3>
              <span>{task.comments?.length || 0}</span>
            </div>

            <div className="task-details__comments">
              {(task.comments || []).map((item) => (
                <article className="task-details__comment" key={item.id}>
                  <span className="task-details__avatar">{item.initials}</span>
                  <div>
                    <header><strong>{item.author}</strong><time>{item.time}</time></header>
                    <p>{item.text}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="task-details__comment-form">
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitComment();
                  }
                }}
                placeholder="Написать комментарий..."
                disabled={busy || readOnly}
              />
              <button type="button" onClick={submitComment} disabled={busy || readOnly || !comment.trim()} aria-label="Отправить комментарий">
                <MessageIcon />
              </button>
            </div>
          </section>
        </div>

        <footer className="task-details__actions">
          {readOnly ? <span className="task-details__readonly">Только просмотр · роль не разрешает изменения</span> : <>
            <button type="button" className="task-details__accept" onClick={() => onUpdate(task.id, { status: 'done' }, 'Задача завершена')} disabled={busy || task.status === 'done'}>
              <CheckIcon />
              <span>{task.status === 'done' ? 'Задача завершена' : 'Принять'}</span>
            </button>
            <button type="button" className="task-details__revise" onClick={() => onUpdate(task.id, { status: 'progress' }, 'Задача возвращена в работу')} disabled={busy}>На доработку</button>
          </>}
        </footer>
      </section>
    </div>
  );
}

export default memo(TaskDetails);
