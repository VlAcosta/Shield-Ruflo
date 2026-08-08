import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PERMISSION_GROUPS } from '../../../services/access/rbacService';
import './RoleEditorModal.scss';

const TONES = [
  { id: 'cyan', label: 'Бирюзовый' },
  { id: 'violet', label: 'Фиолетовый' },
  { id: 'indigo', label: 'Индиго' },
  { id: 'amber', label: 'Янтарный' },
  { id: 'green', label: 'Зелёный' },
];

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.4 3.6 3.5L18 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function RoleEditorModal({ open, role, onClose, onSave, busy = false }) {
  const firstInputRef = useRef(null);
  const [form, setForm] = useState({ label: '', description: '', tone: 'cyan', permissions: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      label: role?.label || '',
      description: role?.description || '',
      tone: role?.tone || 'cyan',
      permissions: Array.isArray(role?.permissions) ? role.permissions : [],
    });
    setError('');
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('portal-modal-open');
    const timer = window.setTimeout(() => firstInputRef.current?.focus(), 60);
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previous;
      document.body.classList.remove('portal-modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [busy, onClose, open, role]);

  const selectedCount = form.permissions.length;
  const totalCount = useMemo(() => PERMISSION_GROUPS.reduce((sum, group) => sum + group.permissions.length, 0), []);

  if (!open || typeof document === 'undefined') return null;

  const togglePermission = (permissionId) => {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permissionId)
        ? current.permissions.filter((item) => item !== permissionId)
        : [...current.permissions, permissionId],
    }));
  };

  const toggleGroup = (group) => {
    const ids = group.permissions.map((permission) => permission.id);
    const allSelected = ids.every((id) => form.permissions.includes(id));
    setForm((current) => {
      const next = new Set(current.permissions);
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return { ...current, permissions: Array.from(next) };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.label.trim().length < 2) {
      setError('Название роли должно содержать минимум 2 символа');
      return;
    }
    if (!form.permissions.length) {
      setError('Выберите хотя бы одно разрешение');
      return;
    }
    setError('');
    const result = await onSave?.({ ...form, label: form.label.trim(), description: form.description.trim() });
    if (result !== false) onClose?.();
  };

  return createPortal(
    <div className="role-editor" role="dialog" aria-modal="true" aria-labelledby="role-editor-title">
      <button type="button" className="role-editor__backdrop" onClick={busy ? undefined : onClose} aria-label="Закрыть" />
      <form className="role-editor__card" onSubmit={submit}>
        <header className="role-editor__head">
          <div>
            <span>ACCESS ROLE</span>
            <h2 id="role-editor-title">{role ? 'Настроить роль' : 'Создать свою роль'}</h2>
            <p>Соберите точный набор действий, который увидят участники с этой ролью.</p>
          </div>
          <button type="button" className="role-editor__close" onClick={onClose} disabled={busy}>×</button>
        </header>

        <div className="role-editor__identity">
          <label><span>Название</span><input ref={firstInputRef} value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Например, Контент-менеджер" maxLength={44}/></label>
          <label><span>Описание</span><input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Коротко объясните назначение роли" maxLength={180}/></label>
        </div>

        <div className="role-editor__tone-row">
          <span>Цвет роли</span>
          <div>{TONES.map((tone) => <button key={tone.id} type="button" className={`is-${tone.id} ${form.tone === tone.id ? 'is-active' : ''}`} onClick={() => setForm((current) => ({ ...current, tone: tone.id }))} aria-label={tone.label}><i/>{form.tone === tone.id ? <CheckIcon/> : null}</button>)}</div>
        </div>

        <div className="role-editor__permissions-head">
          <div><span>Матрица разрешений</span><strong>{selectedCount} / {totalCount}</strong></div>
          <p>Разрешения применятся ко всем участникам с этой ролью. Для отдельного человека их можно переопределить позже.</p>
        </div>

        <div className="role-editor__groups">
          {PERMISSION_GROUPS.map((group, groupIndex) => {
            const ids = group.permissions.map((permission) => permission.id);
            const count = ids.filter((id) => form.permissions.includes(id)).length;
            return (
              <section className="role-editor__group" key={group.id} style={{ '--role-group-index': groupIndex }}>
                <header>
                  <div><strong>{group.label}</strong><span>{group.description}</span></div>
                  <button type="button" onClick={() => toggleGroup(group)}>{count === ids.length ? 'Снять всё' : 'Выбрать всё'} <b>{count}/{ids.length}</b></button>
                </header>
                <div>
                  {group.permissions.map((permission) => {
                    const active = form.permissions.includes(permission.id);
                    return (
                      <button type="button" key={permission.id} className={active ? 'is-active' : ''} onClick={() => togglePermission(permission.id)}>
                        <span className="role-editor__permission-check">{active ? <CheckIcon/> : null}</span>
                        <span><strong>{permission.label}</strong><small>{permission.description}</small></span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {error ? <div className="role-editor__error">{error}</div> : null}
        <footer>
          <button type="button" className="role-editor__cancel" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="submit" className="role-editor__save" disabled={busy}>{busy ? 'Сохраняем…' : role ? 'Сохранить роль' : 'Создать роль'}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
