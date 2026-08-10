import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlusIcon } from '../model/icons';
import { getAvailableRoles } from '../../../services/access/rbacService';
import './InviteUserModal.scss';

const ROLE_COPY = {
  ADMIN: 'Управление командой, компанией и рабочими разделами.',
  MANAGER: 'Работа с задачами, отзывами и основными инструментами.',
  ANALYST: 'Просмотр доступных данных без административных действий.',
  MEMBER: 'Работа с отзывами и задачами без административного доступа.',
};

const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function trapInviteModalFocus(container, event) {
  if (event.key !== 'Tab') return false;

  const focusable = Array.from(container?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
  if (!focusable.length) {
    event.preventDefault();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.4 3.4 7.7-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function InviteUserModal({ open, busy, onClose, onInvite }) {
  const cardRef = useRef(null);
  const previousFocusRef = useRef(null);
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const expiryRef = useRef(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'MEMBER', temporary: false, accessExpiresAt: '' });
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState('');
  const roles = useMemo(() => getAvailableRoles().filter((role) => (
    role.system && String(role.id).toUpperCase() !== 'OWNER'
  )), []);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === form.role) || roles[roles.length - 1],
    [form.role, roles],
  );

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (!busy) onClose();
      return;
    }
    trapInviteModalFocus(cardRef.current, event);
  };

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('portal-modal-open');
    const timer = window.setTimeout(() => cardRef.current?.querySelector('input')?.focus(), 40);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('portal-modal-open');
      window.clearTimeout(timer);
      const previousFocus = previousFocusRef.current;
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setForm({ name: '', email: '', role: 'MEMBER', temporary: false, accessExpiresAt: '' });
      setError('');
      setErrorField('');
      setResult(null);
      setCopied(false);
      setClipboardError('');
    }
  }, [open]);

  useEffect(() => {
    if (!result) return;
    window.requestAnimationFrame(() => cardRef.current?.focus());
  }, [result]);

  if (!open || typeof document === 'undefined') return null;

  const submit = async (event) => {
    event.preventDefault();
    const normalizedEmail = form.email.trim().toLowerCase();
    if (form.name.trim().length < 2) {
      setError('Укажите имя пользователя');
      setErrorField('name');
      nameRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Проверьте email пользователя');
      setErrorField('email');
      emailRef.current?.focus();
      return;
    }

    setError('');
    setErrorField('');
    if (form.temporary && !form.accessExpiresAt) {
      setError('Укажите дату окончания временного доступа');
      setErrorField('accessExpiresAt');
      expiryRef.current?.focus();
      return;
    }
    const response = await onInvite({
      ...form,
      name: form.name.trim(),
      email: normalizedEmail,
      accessExpiresAt: form.temporary && form.accessExpiresAt ? new Date(`${form.accessExpiresAt}T23:59:59`).toISOString() : null,
    });
    if (!response?.ok) {
      setError(response?.message || 'Не удалось создать приглашение');
      return;
    }
    setResult(response.invitation || { email: normalizedEmail, role: form.role });
  };

  const copyLink = async () => {
    if (!result?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      setClipboardError('');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setClipboardError('Не удалось скопировать ссылку. Выделите и скопируйте её вручную.');
    }
  };

  const expiresLabel = result?.expiresAt
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(result.expiresAt))
    : 'в течение 7 дней';

  return createPortal(
    <div className="invite-user-modal" role="dialog" aria-modal="true" aria-labelledby="invite-user-title" onKeyDown={handleDialogKeyDown}>
      <button type="button" className="invite-user-modal__backdrop" onClick={busy ? undefined : onClose} aria-label="Закрыть" tabIndex={-1} />
      <div className="invite-user-modal__stage">
        {!result ? (
          <form ref={cardRef} className="invite-user-modal__card" onSubmit={submit}>
            <header className="invite-user-modal__head">
              <div>
                <span>Команда · новый доступ</span>
                <h2 id="invite-user-title">Пригласить в компанию</h2>
                <p>Пользователь получит персональную ссылку, подтвердит телефон и создаст свой PIN для входа.</p>
              </div>
              <button type="button" className="invite-user-modal__close" onClick={onClose} disabled={busy} aria-label="Закрыть">×</button>
            </header>

            <div className="invite-user-modal__route" aria-label="Как работает приглашение">
              <span><b>1</b> Приглашение</span><i />
              <span><b>2</b> Телефон</span><i />
              <span><b>3</b> Доступ</span>
            </div>

            <div className="invite-user-modal__fields">
              <label>
                <span>Имя пользователя</span>
                <input ref={nameRef} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Анна Петрова" autoComplete="off" aria-invalid={errorField === 'name'} aria-describedby={errorField === 'name' ? 'invite-user-error' : undefined} />
              </label>

              <label>
                <span>Рабочий email</span>
                <input ref={emailRef} type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="anna@company.ru" autoComplete="off" aria-invalid={errorField === 'email'} aria-describedby={errorField === 'email' ? 'invite-user-error' : undefined} />
              </label>
            </div>

            <fieldset className="invite-user-modal__roles">
              <legend>Уровень доступа</legend>
              {roles.map((role) => (
                <label key={role.id} className={form.role === role.id ? 'is-active' : ''}>
                  <input type="radio" name="invite-role" value={role.id} checked={form.role === role.id} onChange={() => setForm((current) => ({ ...current, role: role.id }))} />
                  <span className={`invite-user-modal__role-mark is-${role.id}`}>{role.label.slice(0, 1)}</span>
                  <span><strong>{role.label}</strong><small>{ROLE_COPY[role.id] || role.description || 'Индивидуально настроенный доступ.'}</small></span>
                  <i><CheckIcon /></i>
                </label>
              ))}
            </fieldset>

            <div className="invite-user-modal__permission-note">
              <strong>{selectedRole.label}</strong>
              <span>{ROLE_COPY[selectedRole.id] || selectedRole.description || 'Индивидуально настроенный доступ.'}</span>
            </div>

            <section className={`invite-user-modal__temporary ${form.temporary ? 'is-active' : ''}`}>
              <div>
                <span>Временный доступ</span>
                <strong>Ограничить срок участия</strong>
                <small>После указанной даты вход в компанию автоматически заблокируется.</small>
              </div>
              <button type="button" className={`invite-user-modal__switch ${form.temporary ? 'is-on' : ''}`} role="switch" aria-label="Ограничить срок участия" aria-checked={form.temporary} onClick={() => setForm((current) => ({ ...current, temporary: !current.temporary, accessExpiresAt: current.temporary ? '' : current.accessExpiresAt }))}><span /></button>
              {form.temporary ? <label className="invite-user-modal__expiry"><span>Доступ до</span><input ref={expiryRef} type="date" min={new Date().toISOString().slice(0, 10)} value={form.accessExpiresAt} onChange={(event) => setForm((current) => ({ ...current, accessExpiresAt: event.target.value }))} aria-invalid={errorField === 'accessExpiresAt'} aria-describedby={errorField === 'accessExpiresAt' ? 'invite-user-error' : undefined} /></label> : null}
            </section>

            {error ? <p id="invite-user-error" className="invite-user-modal__error" role="alert">{error}</p> : null}

            <footer>
              <button type="button" className="invite-user-modal__cancel" onClick={onClose} disabled={busy}>Отмена</button>
              <button type="submit" className="invite-user-modal__submit" disabled={busy}>
                <PlusIcon />
                <span>{busy ? 'Создаём приглашение…' : 'Создать приглашение'}</span>
              </button>
            </footer>
          </form>
        ) : (
          <section ref={cardRef} className="invite-user-modal__card invite-user-modal__card--success" tabIndex="-1" role="status" aria-live="polite">
            <button type="button" className="invite-user-modal__close" onClick={onClose} aria-label="Закрыть">×</button>
            <div className="invite-user-modal__success-mark"><CheckIcon /></div>
            <span className="invite-user-modal__success-eyebrow">Доступ подготовлен</span>
            <h2 id="invite-user-title">Приглашение готово</h2>
            <p>{result.demo ? 'В локальном режиме отправка email не выполняется — передайте пользователю ссылку ниже.' : `Приглашение для ${result.email || form.email} создано и готово к отправке.`}</p>

            <div className="invite-user-modal__success-meta">
              <div><span>Пользователь</span><strong>{result.name || form.name}</strong></div>
              <div><span>Роль</span><strong>{roles.find((role) => role.id === (result.role || form.role))?.label || result.role}</strong></div>
              <div><span>Приглашение</span><strong>{expiresLabel}</strong></div>
              {result.accessExpiresAt || form.accessExpiresAt ? <div><span>Доступ до</span><strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(result.accessExpiresAt || `${form.accessExpiresAt}T23:59:59`))}</strong></div> : null}
            </div>

            {result.inviteUrl ? (
              <div className="invite-user-modal__link-box">
                <span>Ссылка для входа в компанию</span>
                <div><code>{result.inviteUrl}</code><button type="button" onClick={copyLink}><CopyIcon /> {copied ? 'Скопировано' : 'Копировать'}</button></div>
              </div>
            ) : (
              <div className="invite-user-modal__sent-note">Email будет отправлен сервисом приглашений. Пользователь появится активным после принятия доступа.</div>
            )}
            {clipboardError ? <p className="invite-user-modal__error" role="alert">{clipboardError}</p> : null}

            <div className="invite-user-modal__success-flow">
              <span>Ссылка</span><i>→</i><span>SMS</span><i>→</i><span>PIN</span><i>→</i><span>Кабинет компании</span>
            </div>

            <button type="button" className="invite-user-modal__submit invite-user-modal__submit--wide" onClick={onClose}>Готово</button>
          </section>
        )}
      </div>
    </div>,
    document.body,
  );
}
