import React, { memo, useEffect, useMemo, useState } from 'react';
import { CalendarIcon, CloseIcon } from '../model/icons';
import { TASK_PRIORITIES, TASK_STATUS_ORDER, getStatusMeta } from '../model/taskData';
import './TaskCreateModal.scss';

const EMPTY_FORM = Object.freeze({
  title: '',
  priority: 'medium',
  status: 'new',
  dueDate: '',
  description: '',
});

function TaskCreateModal({ open, initialStatus = 'new', busy, onClose, onCreate }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, status: initialStatus });
    setSubmitted(false);
  }, [initialStatus, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const valid = useMemo(() => form.title.trim().length >= 3, [form.title]);

  if (!open) return null;

  const submit = () => {
    setSubmitted(true);
    if (!valid || busy) return;

    onCreate({
      title: form.title.trim(),
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate || null,
      description: form.description.trim(),
    });
  };

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="task-create" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-create__dialog" role="dialog" aria-modal="true" aria-labelledby="task-create-title">
        <header className="task-create__head">
          <div>
            <span className="task-create__eyebrow">Новая задача</span>
            <h2 id="task-create-title">Добавить в рабочий процесс</h2>
          </div>
          <button type="button" className="task-create__close" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </button>
        </header>

        <div className="task-create__body">
          <label className={`task-create__field task-create__field--title ${submitted && !valid ? 'is-error' : ''}`}>
            <span>Название задачи *</span>
            <input autoFocus value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="Например: Ответить на отзывы 2GIS" />
            {submitted && !valid ? <small>Введите минимум 3 символа</small> : null}
          </label>

          <div className="task-create__grid">
            <label className="task-create__field">
              <span>Приоритет</span>
              <select value={form.priority} onChange={(event) => setField('priority', event.target.value)}>
                {TASK_PRIORITIES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className="task-create__grid">
            <label className="task-create__field">
              <span>Статус</span>
              <select value={form.status} onChange={(event) => setField('status', event.target.value)}>
                {TASK_STATUS_ORDER.map((status) => <option value={status} key={status}>{getStatusMeta(status).label}</option>)}
              </select>
            </label>

            <label className="task-create__field task-create__field--date">
              <span>Срок</span>
              <div>
                <CalendarIcon />
                <input type="date" value={form.dueDate} onChange={(event) => setField('dueDate', event.target.value)} />
              </div>
            </label>
          </div>

          <label className="task-create__field">
            <span>Описание</span>
            <textarea value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Контекст, ожидаемый результат, важные детали..." />
          </label>

          <div className="task-create__upload task-create__upload--disabled" aria-disabled="true">
            <span className="task-create__upload-copy">
              <strong>Вложения пока недоступны</strong>
              <small>Хранилище файлов ещё не подключено. После создания задачи можно работать с описанием, комментариями и чек-листом.</small>
            </span>
          </div>
        </div>

        <footer className="task-create__actions">
          <button type="button" className="task-create__submit" onClick={submit} disabled={busy}>
            {busy ? 'Создаём…' : 'Создать задачу'}
          </button>
          <button type="button" className="task-create__cancel" onClick={onClose} disabled={busy}>Отмена</button>
        </footer>
      </section>
    </div>
  );
}

export default memo(TaskCreateModal);
