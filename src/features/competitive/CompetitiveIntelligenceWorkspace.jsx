import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addCompetitiveSnapshot,
  createCompetitor,
  getCompetitiveBenchmark,
  getCompetitiveProviderAvailability,
  listCompetitors,
  updateCompetitor,
} from '../../services/competitive/competitiveService';
import './CompetitiveIntelligenceWorkspace.scss';

const STATUS_LABELS = { active: 'Активен', paused: 'Пауза', archived: 'Архив' };
const METRICS = [
  { key: 'averageRating', label: 'Рейтинг', suffix: '★', higher: true, digits: 2 },
  { key: 'reviewCount', label: 'Отзывы', suffix: '', higher: true, digits: 0 },
  { key: 'reviewVelocity30d', label: 'Скорость / 30д', suffix: '', higher: true, digits: 1 },
  { key: 'positiveShare', label: 'Позитив', suffix: '%', higher: true, percent: true },
  { key: 'negativeShare', label: 'Негатив', suffix: '%', higher: false, percent: true },
  { key: 'responseRate', label: 'Ответы', suffix: '%', higher: true, percent: true },
];

function value(metric, raw) {
  if (raw === null || raw === undefined || Number.isNaN(Number(raw))) return '—';
  if (metric.percent) return `${Math.round(Number(raw) * 1000) / 10}%`;
  const digits = metric.digits ?? 1;
  return `${Number(raw).toFixed(digits).replace(/\.0+$/, '')}${metric.suffix}`;
}

function deltaTone(metric, raw) {
  if (typeof raw !== 'number' || raw === 0) return 'neutral';
  const better = metric.higher ? raw > 0 : raw < 0;
  return better ? 'positive' : 'negative';
}

function deltaLabel(metric, raw) {
  if (typeof raw !== 'number') return 'Нет сравнения';
  const normalized = metric.percent ? raw * 100 : raw;
  const digits = metric.percent ? 1 : metric.digits ?? 1;
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits).replace(/\.0+$/, '')}${metric.percent ? ' п.п.' : metric.suffix}`;
}

function CreateCompetitorModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [googlePlaceId, setGooglePlaceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(''); setLocationName(''); setCity(''); setWebsite(''); setGooglePlaceId(''); setError('');
  }, [open]);

  if (!open) return null;
  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true); setError('');
    try {
      const result = await createCompetitor({
        name: name.trim(),
        ...(website.trim() ? { website: website.trim() } : {}),
        locations: [{
          name: locationName.trim(),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(googlePlaceId.trim() ? { googlePlaceId: googlePlaceId.trim() } : {}),
        }],
      });
      onCreated(result.competitor); onClose();
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось добавить конкурента');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="competitive-modal-layer" role="presentation">
      <button type="button" className="competitive-modal-layer__overlay" onClick={onClose} aria-label="Закрыть" />
      <form className="competitive-modal" onSubmit={submit}>
        <header><div><span>NEW COMPETITOR</span><h2>Добавить конкурента</h2></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
        <label><span>Компания</span><input required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} placeholder="Название конкурента" /></label>
        <div className="competitive-modal__row"><label><span>Локация</span><input required maxLength={180} value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder="Филиал / точка" /></label><label><span>Город</span><input maxLength={180} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Тула" /></label></div>
        <label><span>Сайт</span><input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://..." /></label>
        <label><span>Google Place ID — опционально</span><input value={googlePlaceId} onChange={(event) => setGooglePlaceId(event.target.value)} placeholder="ChIJ..." /><small>Shield хранит только Place ID. Google Places content используется live и не попадает в исторические snapshots.</small></label>
        {error ? <div className="competitive-modal__error" role="alert">{error}</div> : null}
        <footer><button type="button" onClick={onClose}>Отмена</button><button type="submit" className="is-primary" disabled={submitting}>{submitting ? 'Добавляем…' : 'Добавить'}</button></footer>
      </form>
    </div>
  );
}

function SnapshotModal({ competitor, location, open, onClose, onSaved }) {
  const [rating, setRating] = useState('');
  const [count, setCount] = useState('');
  const [velocity, setVelocity] = useState('');
  const [positive, setPositive] = useState('');
  const [negative, setNegative] = useState('');
  const [responseRate, setResponseRate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRating(''); setCount(''); setVelocity(''); setPositive(''); setNegative(''); setResponseRate(''); setNotes(''); setError('');
  }, [open]);
  if (!open || !competitor || !location) return null;

  const number = (raw) => raw === '' ? undefined : Number(raw);
  const share = (raw) => raw === '' ? undefined : Number(raw) / 100;
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setError('');
    try {
      const payload = {
        ...(number(rating) !== undefined ? { averageRating: number(rating) } : {}),
        ...(number(count) !== undefined ? { reviewCount: number(count) } : {}),
        ...(number(velocity) !== undefined ? { reviewVelocity30d: number(velocity) } : {}),
        ...(share(positive) !== undefined ? { positiveShare: share(positive) } : {}),
        ...(share(negative) !== undefined ? { negativeShare: share(negative) } : {}),
        ...(share(responseRate) !== undefined ? { responseRate: share(responseRate) } : {}),
        notes: notes.trim(),
      };
      await addCompetitiveSnapshot(competitor.id, location.id, payload);
      await onSaved(); onClose();
    } catch (nextError) { setError(nextError?.message || 'Не удалось сохранить snapshot'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="competitive-modal-layer" role="presentation">
      <button type="button" className="competitive-modal-layer__overlay" onClick={onClose} aria-label="Закрыть" />
      <form className="competitive-modal competitive-modal--snapshot" onSubmit={submit}>
        <header><div><span>PERSISTABLE SNAPSHOT</span><h2>{competitor.name} · {location.name}</h2></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
        <p className="competitive-modal__notice">История хранится только для источников, допускающих retention. Google live content сюда не копируется автоматически.</p>
        <div className="competitive-modal__metrics"><label><span>Рейтинг 0–5</span><input type="number" step="0.1" min="0" max="5" value={rating} onChange={(e) => setRating(e.target.value)} /></label><label><span>Отзывы</span><input type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)} /></label><label><span>Отзывы / 30д</span><input type="number" step="0.1" min="0" value={velocity} onChange={(e) => setVelocity(e.target.value)} /></label><label><span>Позитив %</span><input type="number" step="0.1" min="0" max="100" value={positive} onChange={(e) => setPositive(e.target.value)} /></label><label><span>Негатив %</span><input type="number" step="0.1" min="0" max="100" value={negative} onChange={(e) => setNegative(e.target.value)} /></label><label><span>Ответы %</span><input type="number" step="0.1" min="0" max="100" value={responseRate} onChange={(e) => setResponseRate(e.target.value)} /></label></div>
        <label><span>Источник / примечание</span><textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Откуда получены данные и какой период они покрывают" /></label>
        {error ? <div className="competitive-modal__error" role="alert">{error}</div> : null}
        <footer><button type="button" onClick={onClose}>Отмена</button><button type="submit" className="is-primary" disabled={submitting}>{submitting ? 'Сохраняем…' : 'Сохранить snapshot'}</button></footer>
      </form>
    </div>
  );
}

export default function CompetitiveIntelligenceWorkspace() {
  const [competitors, setCompetitors] = useState([]);
  const [benchmark, setBenchmark] = useState(null);
  const [providers, setProviders] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async (signal) => {
    setLoading(true); setError('');
    try {
      const [list, bench, availability] = await Promise.all([
        listCompetitors({ limit: 100 }, { signal }),
        getCompetitiveBenchmark({}, { signal }),
        getCompetitiveProviderAvailability({ signal }),
      ]);
      setCompetitors(list.items || []); setBenchmark(bench); setProviders(availability);
      setSelectedId((current) => current && list.items.some((item) => item.id === current) ? current : list.items[0]?.id || '');
    } catch (nextError) {
      if (nextError?.name !== 'AbortError') setError(nextError?.message || 'Не удалось загрузить конкурентную аналитику');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const selected = competitors.find((item) => item.id === selectedId) || null;
  const selectedLocation = selected?.locations?.[0] || null;
  const benchmarkRows = useMemo(() => benchmark?.competitors || [], [benchmark]);
  const selectedBenchmark = benchmarkRows.find((row) => row.competitorId === selected?.id && row.locationId === selectedLocation?.id) || null;

  const summary = useMemo(() => {
    const ranked = benchmarkRows.filter((row) => row.metrics?.averageRating !== null && row.metrics?.averageRating !== undefined);
    const best = ranked.sort((a, b) => (b.metrics?.averageRating || 0) - (a.metrics?.averageRating || 0))[0];
    return { competitors: competitors.length, locations: competitors.reduce((sum, item) => sum + item.locations.length, 0), best, ownRating: benchmark?.own?.averageRating ?? null };
  }, [benchmark?.own?.averageRating, benchmarkRows, competitors]);

  const refresh = async () => { const controller = new AbortController(); await load(controller.signal); };
  const changeStatus = async (status) => {
    if (!selected || mutating) return; setMutating(true); setError('');
    try { const result = await updateCompetitor(selected.id, { status }); setCompetitors((current) => current.map((item) => item.id === result.competitor.id ? result.competitor : item)); }
    catch (nextError) { setError(nextError?.message || 'Не удалось изменить конкурента'); }
    finally { setMutating(false); }
  };

  return (
    <section className="competitive-workspace">
      <header className="competitive-hero"><div><span>COMPETITIVE INTELLIGENCE</span><h1>Сравнивайте репутацию без ложной точности</h1><p>Shield показывает ваши реальные review-метрики рядом с верифицированными snapshots конкурентов. Coverage и storage policy видны всегда — live Google данные не маскируются под историю.</p></div><button type="button" onClick={() => setCreateOpen(true)}>+ Добавить конкурента</button></header>
      <div className="competitive-policy"><strong>Source policy</strong><span>История строится только из persistable sources. Google Places — live-only: Shield хранит Place ID и health, но не кэширует rating/reviews как исторический dataset.</span></div>
      <div className="competitive-scorecards"><div><span>Конкуренты</span><strong>{summary.competitors}</strong><small>{summary.locations} локаций</small></div><div><span>Наш рейтинг · 30д</span><strong>{summary.ownRating === null ? '—' : `${summary.ownRating}★`}</strong><small>{benchmark?.own?.reviewCount ?? 0} отзывов</small></div><div><span>Лучший snapshot</span><strong>{summary.best?.metrics?.averageRating ? `${summary.best.metrics.averageRating}★` : '—'}</strong><small>{summary.best?.competitorName || 'Нет данных'}</small></div><div><span>Google live</span><strong>{providers?.googlePlaces?.configured ? 'ON' : 'OFF'}</strong><small>LIVE_ONLY · sample ≤ {providers?.googlePlaces?.maxReviewSample ?? 5}</small></div></div>
      {error ? <div className="competitive-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}
      {loading ? <div className="competitive-loading" role="status"><i /><span>Собираем benchmark…</span></div> : !competitors.length ? <div className="competitive-empty"><span>BENCHMARK START</span><h2>Добавьте первого конкурента</h2><p>Создайте карточку и внесите первый верифицированный snapshot. Google Place ID можно связать отдельно как live-only источник.</p><button type="button" onClick={() => setCreateOpen(true)}>Добавить конкурента</button></div> : (
        <div className="competitive-grid">
          <aside className="competitive-list"><div className="competitive-list__head"><strong>Конкуренты</strong><span>{competitors.length}</span></div>{competitors.map((item) => <button key={item.id} type="button" className={selected?.id === item.id ? 'is-selected' : ''} onClick={() => setSelectedId(item.id)}><div><span className={`competitive-status is-${item.status}`}>{STATUS_LABELS[item.status]}</span><small>{item.locations.length} точек</small></div><strong>{item.name}</strong><p>{item.locations[0]?.city || item.locations[0]?.name || 'Без локации'} · {item.locations[0]?.latestSnapshot ? `${item.locations[0].latestSnapshot.averageRating ?? '—'}★` : 'нет snapshot'}</p></button>)}</aside>
          {selected && selectedLocation ? <article className="competitive-detail">
            <header className="competitive-detail__head"><div><div><span className={`competitive-status is-${selected.status}`}>{STATUS_LABELS[selected.status]}</span><span>{selectedLocation.name}</span></div><h2>{selected.name}</h2><p>{selected.website || selectedLocation.city || 'Competitive benchmark'}</p></div><div className="competitive-detail__actions"><button type="button" className="is-primary" onClick={() => setSnapshotOpen(true)}>+ Snapshot</button>{selected.status === 'active' ? <button type="button" disabled={mutating} onClick={() => changeStatus('PAUSED')}>Пауза</button> : <button type="button" disabled={mutating} onClick={() => changeStatus('ACTIVE')}>Активировать</button>}</div></header>
            <div className="competitive-matrix"><div className="competitive-matrix__head"><span>Метрика</span><span>Мы</span><span>{selected.name}</span><span>Разница</span></div>{METRICS.map((metric) => { const ours = benchmark?.own?.[metric.key]; const theirs = selectedBenchmark?.metrics?.[metric.key]; const diff = selectedBenchmark?.deltas?.[metric.key]; return <div key={metric.key} className="competitive-matrix__row"><strong>{metric.label}</strong><span>{value(metric, ours)}</span><span>{value(metric, theirs)}</span><span className={`is-${deltaTone(metric, diff)}`}>{deltaLabel(metric, diff)}</span></div>; })}</div>
            <div className="competitive-columns"><section className="competitive-panel"><div className="competitive-panel__title"><span>01</span><div><strong>Coverage</strong><small>Каким данным можно доверять</small></div></div><div className="competitive-coverage"><div><span>Исторический snapshot</span><strong>{selectedLocation.latestSnapshot ? 'Есть' : 'Нет'}</strong></div><div><span>Persistable source</span><strong>{selectedLocation.sources.some((source) => source.storagePolicy === 'persistable') ? 'Да' : 'Нет'}</strong></div><div><span>Google Place ID</span><strong>{selectedBenchmark?.coverage?.liveGoogleLinked ? 'Связан' : 'Нет'}</strong></div><div><span>Метрик в benchmark</span><strong>{selectedBenchmark?.coverage?.availableMetrics?.length || 0}/6</strong></div></div></section>
            <section className="competitive-panel"><div className="competitive-panel__title"><span>02</span><div><strong>Источники</strong><small>Retention policy и health</small></div></div><div className="competitive-sources">{selectedLocation.sources.map((source) => <div key={source.id}><span><strong>{source.provider}</strong><small>{source.externalId ? `${source.externalId.slice(0, 24)}…` : 'internal manual source'}</small></span><span className={`storage is-${source.storagePolicy}`}>{source.storagePolicy}</span></div>)}</div></section></div>
            <section className="competitive-method"><strong>Методология сравнения</strong><p>{benchmark?.methodology?.comparisonWarning}</p><div><span>История конкурентов: {benchmark?.methodology?.competitorHistory}</span><span>Google Places: {benchmark?.methodology?.googlePlaces}</span></div></section>
          </article> : null}
        </div>
      )}
      <CreateCompetitorModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(created) => { setCompetitors((current) => [created, ...current]); setSelectedId(created.id); }} />
      <SnapshotModal competitor={selected} location={selectedLocation} open={snapshotOpen} onClose={() => setSnapshotOpen(false)} onSaved={refresh} />
    </section>
  );
}
