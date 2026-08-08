import React, { useEffect, useState } from 'react';
import { ADMIN_MANAGER_STATUS_OPTIONS } from '../model/adminManagersData';

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  role: 'Персональный менеджер',
  status: 'active',
  capacity: 6,
  rating: 0,
  openTickets: 0,
};

export default function ManagerFormModal({ open, manager, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(manager ? {
      name: manager.name || '',
      email: manager.email || '',
      phone: manager.phone || '',
      role: manager.role || 'Персональный менеджер',
      status: manager.status || 'active',
      capacity: manager.capacity || 6,
      rating: manager.rating || 0,
      openTickets: manager.openTickets || 0,
    } : emptyForm);
    setError('');
  }, [open, manager]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError('Укажите имя менеджера');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Проверьте email');
    setError('');
    await onSubmit({
      ...form,
      capacity: Number(form.capacity || 6),
      rating: Number(form.rating || 0),
      openTickets: Number(form.openTickets || 0),
    });
  };

  return (
    <div className="admin-manager-modal" role="dialog" aria-modal="true" aria-label={manager ? 'Редактирование менеджера' : 'Новый менеджер'}>
      <button className="admin-manager-modal__backdrop" type="button" aria-label="Закрыть" onClick={onClose} />
      <form className="admin-manager-modal__panel" onSubmit={submit}>
        <header><div><span>{manager ? 'TEAM PROFILE' : 'NEW TEAMMATE'}</span><h2>{manager ? 'Редактировать менеджера' : 'Добавить менеджера'}</h2><p>Контакты, роль, статус и рабочая нагрузка.</p></div><button type="button" onClick={onClose}>×</button></header>
        <div className="admin-manager-modal__grid">
          <label className="is-wide"><span>Имя и фамилия</span><input value={form.name} onChange={change('name')} autoFocus /></label>
          <label><span>Email</span><input value={form.email} onChange={change('email')} /></label>
          <label><span>Телефон</span><input value={form.phone} onChange={change('phone')} /></label>
          <label><span>Роль</span><input value={form.role} onChange={change('role')} /></label>
          <label><span>Статус</span><select value={form.status} onChange={change('status')}>{ADMIN_MANAGER_STATUS_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>Лимит клиентов</span><input type="number" min="1" max="30" value={form.capacity} onChange={change('capacity')} /></label>
          <label><span>Рейтинг</span><input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={change('rating')} /></label>
        </div>
        {error ? <p className="admin-manager-modal__error">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>Отмена</button><button type="submit" disabled={saving}>{saving ? 'Сохраняем…' : manager ? 'Сохранить' : 'Добавить менеджера'}</button></footer>
      </form>
    </div>
  );
}
