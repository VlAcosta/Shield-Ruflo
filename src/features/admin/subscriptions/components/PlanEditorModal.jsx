import React, { useEffect, useState } from 'react';

const emptyPlan = {
  code: '',
  name: '',
  price: 0,
  currency: 'RUB',
  active: true,
};

export default function PlanEditorModal({ plan, open, onClose, onSave, saving }) {
  const [form, setForm] = useState(emptyPlan);

  useEffect(() => {
    setForm(plan
      ? {
          code: plan.id || '',
          name: plan.name || '',
          price: Number(plan.price || 0),
          currency: plan.currency || 'RUB',
          active: plan.active !== false,
        }
      : { ...emptyPlan });
  }, [plan, open]);

  if (!open) return null;

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSave({
      code: form.code.trim(),
      name: form.name.trim(),
      price: Number(form.price || 0),
      currency: form.currency,
      active: Boolean(form.active),
    });
  };

  return (
    <div className="admin-billing-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="admin-billing-modal__panel" onSubmit={submit}>
        <header>
          <div>
            <span>PLAN CONTROL</span>
            <h3>{plan ? 'Редактировать тариф' : 'Новый тариф'}</h3>
            <p>Сохраняются только реальные поля тарифного плана. Лимиты и entitlements настраиваются отдельно.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="admin-billing-modal__grid">
          <label>
            <span>Код тарифа</span>
            <input
              value={form.code}
              onChange={(event) => set('code', event.target.value)}
              required
              disabled={Boolean(plan)}
              pattern="[A-Za-z0-9_-]+"
              placeholder="PRO"
            />
          </label>
          <label><span>Название</span><input value={form.name} onChange={(event) => set('name', event.target.value)} required /></label>
          <label><span>Цена, ₽ / мес.</span><input type="number" min="0" value={form.price} onChange={(event) => set('price', event.target.value)} required /></label>
          <label>
            <span>Валюта</span>
            <select value={form.currency} onChange={(event) => set('currency', event.target.value)} disabled={Boolean(plan)}>
              <option value="RUB">RUB</option>
            </select>
          </label>
          <label className="admin-billing-modal__wide">
            <span>Состояние тарифа</span>
            <button
              type="button"
              className={`admin-billing-switch ${form.active ? 'is-on' : ''}`}
              onClick={() => set('active', !form.active)}
              aria-pressed={form.active}
            >
              <i />
              {form.active ? 'Активен' : 'Отключён'}
            </button>
          </label>
        </div>
        <footer><button type="button" className="is-secondary" onClick={onClose}>Отмена</button><button type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить тариф'}</button></footer>
      </form>
    </div>
  );
}
