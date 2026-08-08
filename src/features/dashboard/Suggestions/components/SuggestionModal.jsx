import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sendSuggestion, suggestionServiceConfig } from '../../../../services/feedback/suggestionService';

const CATEGORIES = ['Новая функция', 'Улучшение интерфейса', 'Автоматизация', 'Отчёты и аналитика', 'Интеграции', 'Другое'];

export default function SuggestionModal({ open, onClose, onSent }) {
  const cardRef = useRef(null);
  const [form, setForm] = useState({ category: CATEGORIES[0], subject: '', message: '', name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => cardRef.current?.querySelector('input')?.focus(), 20);
    const handleKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open) {
      setForm({ category: CATEGORIES[0], subject: '', message: '', name: '', email: '' });
      setBusy(false);
      setError('');
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const submit = async (event) => {
    event.preventDefault();
    if (form.subject.trim().length < 3 || form.message.trim().length < 10) {
      setError('Добавьте короткий заголовок и опишите идею чуть подробнее.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await sendSuggestion({
        ...form,
        subject: form.subject.trim(),
        message: form.message.trim(),
        route: window.location.pathname,
      });
      onSent?.(result);
      onClose();
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось отправить идею. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="suggestion-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-modal-title">
      <button type="button" className="suggestion-modal__backdrop" onClick={() => !busy && onClose()} aria-label="Закрыть" />
      <form ref={cardRef} className="suggestion-modal__card" onSubmit={submit}>
        <header>
          <div>
            <span>Прямая связь с продуктом</span>
            <h2 id="suggestion-modal-title">Предложить идею</h2>
            <p>Расскажите, чего не хватает. Идея попадёт команде продукта вместе с контекстом страницы.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть">×</button>
        </header>

        <div className="suggestion-modal__categories">
          {CATEGORIES.map((category) => (
            <button type="button" className={form.category === category ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, category }))} key={category}>{category}</button>
          ))}
        </div>

        <label><span>Коротко об идее</span><input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Например, уведомлять о падении рейтинга" /></label>
        <label><span>Как это должно работать?</span><textarea rows="5" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder="Опишите сценарий: что происходит сейчас и как было бы удобнее…" /></label>

        <div className="suggestion-modal__grid">
          <label><span>Ваше имя <small>необязательно</small></span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Алексей" /></label>
          <label><span>Email для ответа <small>необязательно</small></span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="you@company.ru" /></label>
        </div>

        {error ? <div className="suggestion-modal__error">{error}</div> : null}

        <div className="suggestion-modal__delivery">
          <i />
          <div>
            <strong>{suggestionServiceConfig.endpointConfigured ? 'Отправим напрямую команде' : suggestionServiceConfig.emailConfigured ? 'Откроем подготовленное письмо' : 'Сохраним в локальную очередь разработки'}</strong>
            <span>{suggestionServiceConfig.endpointConfigured ? 'Backend сам отправит письмо на настроенный адрес.' : 'Для реальной отправки укажите REACT_APP_SUGGESTIONS_ENDPOINT или REACT_APP_SUGGESTIONS_EMAIL.'}</span>
          </div>
        </div>

        <footer>
          <button type="button" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="submit" disabled={busy}>{busy ? 'Отправляем…' : 'Отправить идею'} <span>→</span></button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
