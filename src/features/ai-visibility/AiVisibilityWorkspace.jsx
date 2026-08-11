import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAiVisibilityProbe,
  getAiVisibilityMetrics,
  listAiVisibilityProbes,
  runAiVisibilityProbe,
  updateAiVisibilityProbe,
} from '../../services/aiVisibility/aiVisibilityService';
import './AiVisibilityWorkspace.scss';

const metricLabel = (value, suffix = '%') => value === null || value === undefined ? '—' : `${value}${suffix}`;
const positionLabel = (value) => value === null || value === undefined ? '—' : `#${value}`;

function latestResult(probe) {
  return probe?.runs?.find((run) => run.status === 'SUCCEEDED' && run.result)?.result ?? null;
}

export default function AiVisibilityWorkspace() {
  const [probes, setProbes] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', query: '', languageCode: 'ru', countryCode: 'RU' });

  const selected = useMemo(() => probes.find((item) => item.id === selectedId) ?? probes[0] ?? null, [probes, selectedId]);
  const result = latestResult(selected);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [probeData, metricData] = await Promise.all([
        listAiVisibilityProbes({ limit: 60 }, { signal }),
        getAiVisibilityMetrics({}, { signal }),
      ]);
      setProbes(probeData.items ?? []);
      setMetrics(metricData);
      setSelectedId((current) => current || probeData.items?.[0]?.id || '');
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Не удалось загрузить AI Visibility');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function createProbe(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await createAiVisibilityProbe({
        name: form.name.trim(),
        query: form.query.trim(),
        languageCode: form.languageCode.trim() || 'ru',
        countryCode: form.countryCode.trim().toUpperCase() || null,
      });
      setShowCreate(false);
      setForm({ name: '', query: '', languageCode: 'ru', countryCode: 'RU' });
      setSelectedId(response.probe.id);
      await load();
    } catch (err) {
      setError(err?.message || 'Не удалось создать probe');
    } finally {
      setBusy(false);
    }
  }

  async function runProbe() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await runAiVisibilityProbe(selected.id);
      await load();
    } catch (err) {
      setError(err?.message || 'Не удалось запустить AI Visibility probe');
    } finally {
      setBusy(false);
    }
  }

  async function toggleProbe() {
    if (!selected) return;
    setBusy(true);
    try {
      await updateAiVisibilityProbe(selected.id, { status: selected.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });
      await load();
    } catch (err) {
      setError(err?.message || 'Не удалось изменить probe');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ai-visibility-workspace">
      <header className="ai-visibility-hero">
        <div>
          <span>DISCOVERY INTELLIGENCE</span>
          <h1>AI Visibility</h1>
          <p>Измеряем, появляется ли бренд в AI-ответах, кого система показывает вместо него и на какие источники опирается. Метрики всегда сопровождаются выборкой и методологией.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}>+ Новый probe</button>
      </header>

      {error ? <div className="ai-visibility-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      <div className="ai-visibility-scorecards">
        <div><span>Brand mention rate</span><strong>{metricLabel(metrics?.brandMentionRate)}</strong><small>{metrics?.sampleSize ?? 0} успешных запусков</small></div>
        <div><span>Share of AI voice</span><strong>{metricLabel(metrics?.shareOfAiVoice)}</strong><small>бренд / бренд + конкуренты</small></div>
        <div><span>Average AI position</span><strong>{positionLabel(metrics?.averageAiPosition)}</strong><small>только измеримые позиции</small></div>
        <div><span>Citation coverage</span><strong>{metricLabel(metrics?.citationCoverage)}</strong><small>только grounded runs</small></div>
      </div>

      <div className="ai-visibility-grid">
        <aside className="ai-visibility-list">
          <div className="ai-visibility-list__head"><span>Probe library</span><strong>{probes.length}</strong></div>
          {loading ? <div className="ai-visibility-loading"><i />Загрузка</div> : null}
          {!loading && probes.length === 0 ? <div className="ai-visibility-empty-mini">Создайте первый discovery probe</div> : null}
          {probes.map((probe) => {
            const last = probe.runs?.[0];
            return (
              <button type="button" key={probe.id} className={selected?.id === probe.id ? 'is-selected' : ''} onClick={() => setSelectedId(probe.id)}>
                <div><span className={`ai-visibility-status is-${probe.status.toLowerCase()}`}>{probe.status}</span><small>{last?.status || 'NO RUNS'}</small></div>
                <strong>{probe.name}</strong>
                <p>{probe.query}</p>
              </button>
            );
          })}
        </aside>

        <article className="ai-visibility-detail">
          {!selected ? <div className="ai-visibility-empty"><span>AI VISIBILITY</span><h2>Пока нет probes</h2><p>Добавьте запрос, по которому пользователи могут искать ваш бизнес через AI.</p></div> : (
            <>
              <div className="ai-visibility-detail__head">
                <div><span>{selected.languageCode.toUpperCase()} {selected.countryCode ? `· ${selected.countryCode}` : ''}</span><h2>{selected.name}</h2><p>{selected.query}</p></div>
                <div className="ai-visibility-actions"><button type="button" onClick={toggleProbe} disabled={busy}>{selected.status === 'ACTIVE' ? 'Пауза' : 'Активировать'}</button><button type="button" className="is-primary" onClick={runProbe} disabled={busy || selected.status !== 'ACTIVE'}>{busy ? 'Проверяем…' : 'Запустить'}</button></div>
              </div>

              <div className="ai-visibility-result-grid">
                <div><span>Brand</span><strong>{result ? (result.brandMentioned ? 'Упомянут' : 'Не упомянут') : '—'}</strong></div>
                <div><span>Position</span><strong>{positionLabel(result?.brandPosition)}</strong></div>
                <div><span>Sentiment</span><strong>{result?.sentiment || '—'}</strong></div>
                <div><span>Citations</span><strong>{result?.citations?.length ?? '—'}</strong></div>
              </div>

              <div className="ai-visibility-columns">
                <section className="ai-visibility-panel">
                  <div className="ai-visibility-panel__title"><span>01</span><div><strong>Observed answer</strong><small>Последний успешный run</small></div></div>
                  {result ? <p className="ai-visibility-answer">{result.answerText}</p> : <p className="ai-visibility-muted">Нет успешного измерения. Failed/queued runs не участвуют в метриках.</p>}
                  {result?.competitors?.length ? <div className="ai-visibility-competitors">{result.competitors.map((item) => <div key={item.id}><span>{positionLabel(item.position)}</span><strong>{item.name}</strong></div>)}</div> : null}
                </section>
                <section className="ai-visibility-panel">
                  <div className="ai-visibility-panel__title"><span>02</span><div><strong>Evidence</strong><small>Provider URL citations</small></div></div>
                  {result?.citations?.length ? <div className="ai-visibility-citations">{result.citations.map((citation) => <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer"><strong>{citation.title || citation.domain || 'Source'}</strong><span>{citation.domain}</span></a>)}</div> : <p className="ai-visibility-muted">Цитаты не измерены или отсутствуют. Shield не создаёт источники эвристически.</p>}
                </section>
              </div>

              <section className="ai-visibility-method">
                <strong>Методология</strong>
                <p>Share of AI Voice и позиции считаются только по успешным run’ам. Citation Quality пока не выводится: без provider/source-quality сигналов Shield не присваивает доменам выдуманный «вес».</p>
                <div>{Object.entries(metrics?.methodology || {}).map(([key, value]) => <span key={key} title={value}>{key}</span>)}</div>
              </section>
            </>
          )}
        </article>
      </div>

      {showCreate ? <div className="ai-visibility-modal-layer"><button className="ai-visibility-modal-layer__overlay" aria-label="Закрыть" onClick={() => setShowCreate(false)} /><form className="ai-visibility-modal" onSubmit={createProbe}><header><div><span>NEW PROBE</span><h2>Новый discovery-запрос</h2></div><button type="button" onClick={() => setShowCreate(false)}>×</button></header><label><span>Название</span><input required value={form.name} onChange={(e) => setForm((value) => ({ ...value, name: e.target.value }))} placeholder="Лучшие кофейни · Тула" /></label><label><span>Запрос</span><textarea required rows="4" value={form.query} onChange={(e) => setForm((value) => ({ ...value, query: e.target.value }))} placeholder="Где провести спокойную деловую встречу за кофе в Туле?" /></label><div className="ai-visibility-modal__row"><label><span>Язык</span><input value={form.languageCode} onChange={(e) => setForm((value) => ({ ...value, languageCode: e.target.value }))} /></label><label><span>Страна</span><input maxLength="2" value={form.countryCode} onChange={(e) => setForm((value) => ({ ...value, countryCode: e.target.value }))} /></label></div><p>Запуск использует внешний AI provider и доступен только при серверном entitlement. Создание probe само по себе не создаёт фиктивный результат.</p><footer><button type="button" onClick={() => setShowCreate(false)}>Отмена</button><button type="submit" className="is-primary" disabled={busy}>{busy ? 'Создаём…' : 'Создать'}</button></footer></form></div> : null}
    </section>
  );
}
