import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import { createCompetitor, getCompetitors, removeCompetitor } from '../../../services/competitors/competitorService';
import './Competitors.scss';

const PLATFORMS = Object.freeze([
  { id: 'yandex', label: 'Яндекс', short: 'Я' },
  { id: '2gis', label: '2GIS', short: '2G' },
  { id: 'ozon', label: 'Ozon', short: 'OZ' },
  { id: 'otzovik', label: 'Отзовик', short: 'ОТ' },
  { id: 'wb', label: 'Wildberries', short: 'WB' },
]);

const platformMeta = (id) => PLATFORMS.find((item) => item.id === id) || PLATFORMS[0];
const formatDelta = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;

function CompetitorModal({ open, items, onClose, onAdd, onRemove }) {
  const [form, setForm] = useState({ name: '', platform: 'yandex', url: '', rating: '', reviews: '', negativeShare: '', responseCoverage: '' });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;
  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onAdd({
      ...form,
      name: form.name.trim(),
      rating: form.rating === '' ? null : Number(form.rating),
      reviews: form.reviews === '' ? null : Number(form.reviews),
      negativeShare: form.negativeShare === '' ? null : Number(form.negativeShare),
      responseCoverage: form.responseCoverage === '' ? null : Number(form.responseCoverage),
    });
    setForm({ name: '', platform: 'yandex', url: '', rating: '', reviews: '', negativeShare: '', responseCoverage: '' });
  };

  return createPortal(
    <div className="competitor-modal" role="presentation">
      <button type="button" className="competitor-modal__backdrop" onClick={onClose} aria-label="Закрыть" />
      <section className="competitor-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="competitor-modal-title">
        <header><div><span>COMPETITOR INTELLIGENCE</span><h2 id="competitor-modal-title">Настроить конкурентов</h2><p>До подключения провайдера можно сохранить базовые показатели вручную. Позже они будут синхронизироваться автоматически.</p></div><button type="button" onClick={onClose}>×</button></header>
        <div className="competitor-modal__body">
          <form onSubmit={submit}>
            <label><span>Название</span><input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Например, Сеть ресторанов №1" /></label>
            <div className="competitor-modal__grid"><label><span>Площадка</span><select value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}>{PLATFORMS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label><span>Ссылка</span><input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." /></label></div>
            <div className="competitor-modal__metrics">
              <label><span>Рейтинг</span><input type="number" min="1" max="5" step="0.01" value={form.rating} onChange={(event) => setForm((current) => ({ ...current, rating: event.target.value }))} placeholder="4.72" /></label>
              <label><span>Отзывы</span><input type="number" min="0" value={form.reviews} onChange={(event) => setForm((current) => ({ ...current, reviews: event.target.value }))} placeholder="845" /></label>
              <label><span>Негатив, %</span><input type="number" min="0" max="100" value={form.negativeShare} onChange={(event) => setForm((current) => ({ ...current, negativeShare: event.target.value }))} placeholder="12" /></label>
              <label><span>Ответы, %</span><input type="number" min="0" max="100" value={form.responseCoverage} onChange={(event) => setForm((current) => ({ ...current, responseCoverage: event.target.value }))} placeholder="91" /></label>
            </div>
            <button type="submit" className="competitor-modal__primary" disabled={!form.name.trim()}>Добавить конкурента</button>
          </form>
          <aside><span>Добавлено</span>{items.length ? items.map((item) => <article key={item.id}><i>{platformMeta(item.platform).short}</i><div><strong>{item.name}</strong><small>{platformMeta(item.platform).label} · {item.rating ? `${item.rating.toFixed(2)} ★` : 'метрики не указаны'}</small></div><button type="button" onClick={() => onRemove(item.id)} aria-label={`Удалить ${item.name}`}>×</button></article>) : <p>Пока ни одного конкурента. Добавьте 2–5 компаний для нормального benchmark.</p>}</aside>
        </div>
        <footer><span>Рекомендуем отслеживать 3–5 прямых конкурентов на тех же площадках, где работает ваша компания.</span><button type="button" onClick={onClose}>Готово</button></footer>
      </section>
    </div>, document.body,
  );
}

function Competitors() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const { section: metrics } = useDashboardData('metrics');
  const ownRating = Number(metrics?.rating?.value || 0) || null;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await getCompetitors(); setItems(result.items || []); }
    catch (nextError) { setError(nextError?.message || 'Не удалось загрузить конкурентов'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const rated = items.filter((item) => Number(item.rating) > 0);
    const average = rated.length ? rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length : null;
    const strongest = rated.slice().sort((a, b) => Number(b.rating) - Number(a.rating))[0] || null;
    const negativeValues = items.filter((item) => item.negativeShare != null);
    const negative = negativeValues.length ? negativeValues.reduce((sum, item) => sum + Number(item.negativeShare), 0) / negativeValues.length : null;
    return { average, strongest, negative, delta: ownRating && average ? ownRating - average : null };
  }, [items, ownRating]);

  const add = useCallback(async (payload) => {
    try { const result = await createCompetitor(payload, items); setItems(result.items || items); }
    catch (nextError) { setError(nextError?.message || 'Не удалось добавить конкурента'); }
  }, [items]);
  const remove = useCallback(async (id) => {
    const previous = items; setItems((current) => current.filter((item) => item.id !== id));
    try { setItems(await removeCompetitor(id, previous)); }
    catch (nextError) { setItems(previous); setError(nextError?.message || 'Не удалось удалить конкурента'); }
  }, [items]);

  return <>
    <DashboardCard title="Конкуренты" eyebrow="Market intelligence" action={<button type="button" className="dashboard-competitors__manage" onClick={() => setModalOpen(true)}>{items.length ? 'Настроить' : '+ Добавить'}</button>} className="dashboard-competitors" motion="right">
      {loading ? <DashboardWidgetState type="loading" /> : error && !items.length ? <DashboardWidgetState type="error" text={error} onRetry={load} /> : !items.length ? (
        <button type="button" className="dashboard-competitors__empty" onClick={() => setModalOpen(true)}><span>CI</span><div><strong>Соберите конкурентный benchmark</strong><p>Добавьте 3–5 прямых конкурентов. Система сравнит рейтинг, негатив и работу с отзывами.</p><b>Добавить первого конкурента →</b></div></button>
      ) : (
        <div className="dashboard-competitors__body">
          <div className="dashboard-competitors__benchmark">
            <div><span>Ваш рейтинг</span><strong>{ownRating ? ownRating.toFixed(2) : '—'}</strong><small>ваша компания</small></div>
            <i>vs</i>
            <div><span>Рынок</span><strong>{summary.average ? summary.average.toFixed(2) : '—'}</strong><small>{items.length} конкурента</small></div>
            <aside className={summary.delta != null && summary.delta >= 0 ? 'is-positive' : 'is-negative'}><span>Разница</span><strong>{summary.delta == null ? '—' : formatDelta(summary.delta)}</strong><small>{summary.delta == null ? 'нужны данные' : summary.delta >= 0 ? 'выше benchmark' : 'ниже benchmark'}</small></aside>
          </div>
          <div className="dashboard-competitors__list">{items.slice(0, 3).map((item, index) => {
            const meta = platformMeta(item.platform);
            const delta = ownRating && item.rating ? ownRating - item.rating : null;
            return <article key={item.id} style={{ '--competitor-index': index }}><span className="dashboard-competitors__platform">{meta.short}</span><div><strong>{item.name}</strong><small>{meta.label} · {item.reviews != null ? `${item.reviews} отзывов` : 'ожидаем синхронизацию'}</small></div><span className="dashboard-competitors__rating">{item.rating ? item.rating.toFixed(2) : '—'}<small>{delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} к вам`}</small></span></article>;
          })}</div>
          <div className="dashboard-competitors__insight"><span>INSIGHT</span><strong>{summary.strongest ? `${summary.strongest.name} — ориентир по рейтингу ${summary.strongest.rating.toFixed(2)}.` : 'Добавьте рейтинги, чтобы система построила сравнение.'}</strong>{summary.negative != null ? <small>Средняя доля негатива у выбранных конкурентов: {Math.round(summary.negative)}%</small> : null}</div>
        </div>
      )}
      {error && items.length ? <div className="dashboard-competitors__error">{error}</div> : null}
    </DashboardCard>
    <CompetitorModal open={modalOpen} items={items} onClose={() => setModalOpen(false)} onAdd={add} onRemove={remove} />
  </>;
}
export default memo(Competitors);
