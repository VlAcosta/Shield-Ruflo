import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PRIORITIES = [
  { value: 'none', label: 'Без приоритета', tone: 'neutral' },
  { value: 'low', label: 'Низкий', tone: 'violet' },
  { value: 'medium', label: 'Средний', tone: 'orange' },
  { value: 'high', label: 'Высокий', tone: 'orange' },
  { value: 'critical', label: 'Критический', tone: 'red' },
];

const OWNERS = ['Пользователь', 'Команда', 'Менеджер', 'БИЗНЕС ЩИТ'];

function dateAfterDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function ChecklistCreateModal({ open, onClose, onCreate }) {
  const cardRef = useRef(null);
  const [form, setForm] = useState(() => ({ title: '', priority: 'medium', owner: 'Пользователь', date: dateAfterDays(3), note: '' }));
  const [error, setError] = useState('');

  const selectedPriority = useMemo(
    () => PRIORITIES.find((item) => item.value === form.priority) || PRIORITIES[1],
    [form.priority]
  );

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => cardRef.current?.querySelector('input')?.focus(), 20);
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      setForm({ title: '', priority: 'medium', owner: 'Пользователь', date: dateAfterDays(3), note: '' });
      setError('');
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const submit = (event) => {
    event.preventDefault();
    if (form.title.trim().length < 3) {
      setError('Название должно содержать минимум 3 символа');
      return;
    }
    if (!form.date) {
      setError('Выберите срок выполнения');
      return;
    }
    onCreate({
      title: form.title.trim(),
      priority: selectedPriority.label,
      priorityId: selectedPriority.value,
      tone: selectedPriority.tone,
      owner: form.owner,
      date: new Intl.DateTimeFormat('ru-RU').format(new Date(`${form.date}T12:00:00`)),
      rawDate: form.date,
      note: form.note.trim(),
    });
    onClose();
  };

  return createPortal(
    <div className="checklist-create" role="dialog" aria-modal="true" aria-labelledby="checklist-create-title">
      <button type="button" className="checklist-create__backdrop" onClick={onClose} aria-label="Закрыть форму" />
      <form ref={cardRef} className="checklist-create__card" onSubmit={submit}>
        <header className="checklist-create__head">
          <div>
            <span>Новая задача</span>
            <h2 id="checklist-create-title">Добавить в чек-лист</h2>
            <p>Короткая задача с ответственным, сроком и приоритетом.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <label className="checklist-create__field checklist-create__field--wide">
          <span>Что нужно сделать?</span>
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Например, обновить QR-код на стойке" />
        </label>

        <div className="checklist-create__grid">
          <label className="checklist-create__field">
            <span>Приоритет</span>
            <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
              {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="checklist-create__field">
            <span>Ответственный</span>
            <select value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}>
              {OWNERS.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
            </select>
          </label>
        </div>

        <label className="checklist-create__field">
          <span>Срок</span>
          <input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
        </label>

        <label className="checklist-create__field">
          <span>Комментарий <small>необязательно</small></span>
          <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows="3" placeholder="Контекст для команды…" />
        </label>

        {error ? <div className="checklist-create__error">{error}</div> : null}

        <div className="checklist-create__preview">
          <span className={`is-${selectedPriority.tone}`}>{selectedPriority.label}</span>
          <strong>{form.title.trim() || 'Новая задача'}</strong>
          <small>{form.owner} · {form.date ? new Intl.DateTimeFormat('ru-RU').format(new Date(`${form.date}T12:00:00`)) : 'без срока'}</small>
        </div>

        <footer>
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="submit">Создать задачу <span>→</span></button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
