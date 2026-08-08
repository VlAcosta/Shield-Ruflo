import React, { useEffect, useState } from 'react';

const emptyPlan = {
  name: '', price: 0, trialDays: 14, replies: 10, reports: 3, consultations: 0, platforms: 1,
  support: 'Email поддержка', tone: 'violet', features: [],
};

export default function PlanEditorModal({ plan, open, onClose, onSave, saving }) {
  const [form, setForm] = useState(emptyPlan);

  useEffect(() => {
    setForm(plan ? { ...emptyPlan, ...plan, features: [...(plan.features || [])] } : { ...emptyPlan });
  }, [plan, open]);

  if (!open) return null;

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    const normalized = {
      ...form,
      price: Number(form.price || 0),
      trialDays: Number(form.trialDays || 0),
      replies: Number(form.replies || 0),
      reports: Number(form.reports || 0),
      consultations: Number(form.consultations || 0),
      platforms: Number(form.platforms || 0),
      features: String(form.featuresText ?? form.features.join('\n')).split('\n').map((item) => item.trim()).filter(Boolean),
    };
    delete normalized.featuresText;
    onSave(normalized);
  };

  return (
    <div className="admin-billing-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="admin-billing-modal__panel" onSubmit={submit}>
        <header><div><span>PLAN CONTROL</span><h3>{plan ? 'Редактировать тариф' : 'Новый тариф'}</h3><p>Лимиты и стоимость будут использоваться в административной модели подписок.</p></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
        <div className="admin-billing-modal__grid">
          <label><span>Название</span><input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
          <label><span>Цена, ₽ / мес.</span><input type="number" min="0" value={form.price} onChange={(e) => set('price', e.target.value)} required /></label>
          <label><span>Пробный период, дней</span><input type="number" min="0" value={form.trialDays} onChange={(e) => set('trialDays', e.target.value)} /></label>
          <label><span>Ответов / мес.</span><input type="number" value={form.replies} onChange={(e) => set('replies', e.target.value)} /><small>−1 = безлимит</small></label>
          <label><span>Отчётов / мес.</span><input type="number" value={form.reports} onChange={(e) => set('reports', e.target.value)} /><small>−1 = безлимит</small></label>
          <label><span>Консультаций</span><input type="number" value={form.consultations} onChange={(e) => set('consultations', e.target.value)} /></label>
          <label><span>Площадок</span><input type="number" value={form.platforms} onChange={(e) => set('platforms', e.target.value)} /><small>−1 = все площадки</small></label>
          <label><span>Поддержка</span><input value={form.support} onChange={(e) => set('support', e.target.value)} /></label>
          <label className="admin-billing-modal__wide"><span>Преимущества — по одному в строке</span><textarea rows="6" value={form.featuresText ?? form.features.join('\n')} onChange={(e) => set('featuresText', e.target.value)} /></label>
        </div>
        <footer><button type="button" className="is-secondary" onClick={onClose}>Отмена</button><button type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить тариф'}</button></footer>
      </form>
    </div>
  );
}
