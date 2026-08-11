import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getListingHealthLocation,
  getListingHealthOverview,
  getListingProviderAccounts,
  getListingProviderLocations,
  linkListingSource,
  syncListingSource,
  updateCanonicalListing,
} from '../../services/listings/listingHealthService';
import './ListingHealthWorkspace.scss';

function scoreTone(score) {
  if (score === null || score === undefined) return 'unknown';
  if (score >= 90) return 'good';
  if (score >= 70) return 'warning';
  return 'critical';
}

function latest(source) {
  return source?.snapshots?.[0] ?? null;
}

export default function ListingHealthWorkspace() {
  const [overview, setOverview] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [canonical, setCanonical] = useState({});
  const [accountId, setAccountId] = useState('');
  const [providerLocations, setProviderLocations] = useState([]);
  const [externalLocationId, setExternalLocationId] = useState('');

  const locations = useMemo(() => overview?.items ?? [], [overview?.items]);
  const selected = useMemo(() => locations.find((item) => item.id === selectedId) ?? locations[0] ?? null, [locations, selectedId]);

  const loadOverview = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [health, providers] = await Promise.all([
        getListingHealthOverview({}, { signal }),
        getListingProviderAccounts({ signal }),
      ]);
      setOverview(health);
      setAccounts(providers.items ?? []);
      setSelectedId((value) => value || health.items?.[0]?.id || '');
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Не удалось загрузить Location Health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOverview(controller.signal);
    return () => controller.abort();
  }, [loadOverview]);

  useEffect(() => {
    if (!selected?.id) { setDetail(null); return undefined; }
    const controller = new AbortController();
    getListingHealthLocation(selected.id, { signal: controller.signal })
      .then(setDetail)
      .catch((err) => { if (err?.name !== 'AbortError') setError(err?.message || 'Не удалось загрузить локацию'); });
    return () => controller.abort();
  }, [selected?.id]);

  function openCanonical() {
    if (!selected) return;
    setCanonical({
      name: selected.name || '',
      phone: selected.phone || '',
      website: selected.website || '',
      countryCode: selected.countryCode || '',
      region: selected.region || '',
      city: selected.city || '',
      addressLine1: selected.addressLine1 || '',
      addressLine2: selected.addressLine2 || '',
      postalCode: selected.postalCode || '',
    });
    setEditOpen(true);
  }

  async function saveCanonical(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const patch = Object.fromEntries(Object.entries(canonical).map(([key, value]) => [key, value === '' ? null : value]));
      if (canonical.name) patch.name = canonical.name;
      await updateCanonicalListing(selected.id, patch);
      setEditOpen(false);
      await loadOverview();
    } catch (err) {
      setError(err?.message || 'Не удалось обновить канонический профиль');
    } finally {
      setBusy(false);
    }
  }

  async function selectAccount(value) {
    setAccountId(value);
    setExternalLocationId('');
    setProviderLocations([]);
    if (!value) return;
    setBusy(true);
    try {
      const response = await getListingProviderLocations(value);
      setProviderLocations(response.items ?? []);
    } catch (err) {
      setError(err?.message || 'Не удалось получить locations провайдера');
    } finally {
      setBusy(false);
    }
  }

  async function mapSource(event) {
    event.preventDefault();
    if (!selected || !accountId || !externalLocationId) return;
    setBusy(true);
    try {
      await linkListingSource(selected.id, { integrationAccountId: accountId, externalLocationId });
      setMapOpen(false);
      setAccountId('');
      setProviderLocations([]);
      setExternalLocationId('');
      await loadOverview();
    } catch (err) {
      setError(err?.message || 'Не удалось сопоставить listing');
    } finally {
      setBusy(false);
    }
  }

  async function syncSource(sourceId) {
    setBusy(true);
    try {
      await syncListingSource(sourceId);
      await loadOverview();
    } catch (err) {
      setError(err?.message || 'Не удалось поставить синхронизацию в очередь');
    } finally {
      setBusy(false);
    }
  }

  const detailLocation = detail?.location;
  const detailSources = detailLocation?.listingSources ?? [];
  const issues = detailSources.flatMap((source) => latest(source)?.issues ?? []);

  return (
    <section className="listing-health-workspace">
      <header className="listing-health-hero">
        <div>
          <span>LOCATION INTELLIGENCE</span>
          <h1>Listings & Location Health</h1>
          <p>Канонические данные Business Shield против реально наблюдаемых профилей площадок. Каждый потерянный балл объясняется конкретным полем, а неподдерживаемые provider-поля не снижают score.</p>
        </div>
        <div className="listing-health-hero__score">
          <span>Average health</span>
          <strong>{overview?.summary?.averageHealthScore ?? '—'}</strong>
          <small>{overview?.summary?.measuredLocations ?? 0} / {overview?.summary?.locationCount ?? 0} измерено</small>
        </div>
      </header>

      {error ? <div className="listing-health-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      <div className="listing-health-layout">
        <aside className="listing-health-list">
          <div className="listing-health-list__head"><span>Locations</span><strong>{locations.length}</strong></div>
          {loading ? <div className="listing-health-loading">Загрузка…</div> : null}
          {!loading && locations.length === 0 ? <div className="listing-health-empty-mini">Нет активных локаций</div> : null}
          {locations.map((location) => (
            <button key={location.id} type="button" className={selected?.id === location.id ? 'is-selected' : ''} onClick={() => setSelectedId(location.id)}>
              <div><span>{location.business?.name}</span><strong className={`is-${scoreTone(location.health.score)}`}>{location.health.score ?? '—'}</strong></div>
              <h3>{location.name}</h3>
              <p>{[location.city, location.addressLine1].filter(Boolean).join(' · ') || 'Адрес не заполнен'}</p>
              <small>{location.health.criticalIssues} critical · {location.health.warningIssues} warning · {location.health.measuredSourceCount}/{location.health.sourceCount} sources</small>
            </button>
          ))}
        </aside>

        <article className="listing-health-detail">
          {!selected ? <div className="listing-health-empty"><h2>Выберите локацию</h2></div> : (
            <>
              <div className="listing-health-detail__head">
                <div><span>{selected.business?.name}</span><h2>{selected.name}</h2><p>{[selected.countryCode, selected.region, selected.city, selected.addressLine1, selected.postalCode].filter(Boolean).join(', ') || 'Канонический адрес не заполнен'}</p></div>
                <div><button type="button" onClick={openCanonical}>Канонические данные</button><button type="button" className="is-primary" onClick={() => setMapOpen(true)}>+ Источник</button></div>
              </div>

              <div className="listing-health-stats">
                <div><span>Health score</span><strong className={`is-${scoreTone(selected.health.score)}`}>{selected.health.score ?? '—'}</strong></div>
                <div><span>Sources</span><strong>{selected.health.measuredSourceCount}/{selected.health.sourceCount}</strong></div>
                <div><span>Critical</span><strong>{selected.health.criticalIssues}</strong></div>
                <div><span>Score version</span><strong>v{selected.health.scoreVersion}</strong></div>
              </div>

              <section className="listing-health-panel">
                <div className="listing-health-panel__title"><div><span>01</span><strong>Observed sources</strong></div><small>Синхронизация выполняется worker’ом</small></div>
                {detailSources.length === 0 ? <p className="listing-health-muted">Нет сопоставленных площадок. Добавьте реальный provider source — score не вычисляется из предположений.</p> : (
                  <div className="listing-health-sources">{detailSources.map((source) => {
                    const snapshot = latest(source);
                    const normalized = snapshot?.normalized || {};
                    return <div key={source.id} className="listing-health-source"><header><div><strong>{source.integrationAccount?.name || source.provider}</strong><span>{source.externalLocationId}</span></div><em className={`is-${scoreTone(snapshot?.healthScore ?? null)}`}>{snapshot?.healthScore ?? '—'}</em></header><div className="listing-health-source__coverage"><span>Measured: {Array.isArray(normalized.measuredFields) ? normalized.measuredFields.join(', ') : '—'}</span><span>Unmeasured: {Array.isArray(normalized.unmeasuredFields) ? normalized.unmeasuredFields.join(', ') : '—'}</span></div><footer><small>{source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString('ru-RU') : 'Ещё не синхронизирован'}</small><button type="button" disabled={busy} onClick={() => syncSource(source.id)}>Синхронизировать</button></footer>{source.lastErrorMessage ? <p className="listing-health-source__error">{source.lastErrorCode}: {source.lastErrorMessage}</p> : null}</div>;
                  })}</div>
                )}
              </section>

              <section className="listing-health-panel">
                <div className="listing-health-panel__title"><div><span>02</span><strong>Needs attention</strong></div><small>{issues.length} issues</small></div>
                {issues.length === 0 ? <p className="listing-health-muted">Для последнего измерения проблем нет либо данных ещё недостаточно.</p> : <div className="listing-health-issues">{issues.map((item) => <div key={item.id} className={`is-${item.severity.toLowerCase()}`}><span>{item.severity}</span><div><strong>{item.field} · {item.type}</strong><p>{item.explanation}</p><small>Expected: {item.expected == null ? '—' : JSON.stringify(item.expected)} · Observed: {item.observed == null ? '—' : JSON.stringify(item.observed)}</small></div></div>)}</div>}
              </section>

              <section className="listing-health-method"><strong>Health Score v{overview?.methodology?.scoreVersion ?? 1}</strong><p>Score нормализуется по полям, которые источник способен измерить. Freshness считается отдельно. История snapshots сохраняет версию формулы.</p><div>{Object.entries(overview?.methodology?.weights || {}).map(([field, weight]) => <span key={field}>{field}: {weight}</span>)}</div></section>
            </>
          )}
        </article>
      </div>

      {editOpen ? <div className="listing-health-modal-layer"><button className="listing-health-overlay" aria-label="Закрыть" onClick={() => setEditOpen(false)} /><form className="listing-health-modal" onSubmit={saveCanonical}><header><div><span>CANONICAL PROFILE</span><h2>{selected?.name}</h2></div><button type="button" onClick={() => setEditOpen(false)}>×</button></header><div className="listing-health-form-grid">{Object.entries(canonical).map(([key, value]) => <label key={key}><span>{key}</span><input required={key === 'name'} value={value ?? ''} onChange={(e) => setCanonical((current) => ({ ...current, [key]: e.target.value }))} /></label>)}</div><footer><button type="button" onClick={() => setEditOpen(false)}>Отмена</button><button type="submit" className="is-primary" disabled={busy}>Сохранить</button></footer></form></div> : null}

      {mapOpen ? <div className="listing-health-modal-layer"><button className="listing-health-overlay" aria-label="Закрыть" onClick={() => setMapOpen(false)} /><form className="listing-health-modal" onSubmit={mapSource}><header><div><span>MAP PROVIDER</span><h2>Сопоставить внешний listing</h2></div><button type="button" onClick={() => setMapOpen(false)}>×</button></header><label><span>Connected account</span><select required value={accountId} onChange={(e) => selectAccount(e.target.value)}><option value="">Выберите account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.providerName} · {account.name}</option>)}</select></label><label><span>Provider location</span><select required disabled={!accountId || busy} value={externalLocationId} onChange={(e) => setExternalLocationId(e.target.value)}><option value="">Выберите location</option>{providerLocations.map((location) => <option key={location.externalId} value={location.externalId}>{location.title || location.externalId}{location.address ? ` · ${location.address}` : ''}</option>)}</select></label><p>Список locations приходит от подключённого provider через защищённые server credentials. После mapping запустите worker sync для измерения.</p><footer><button type="button" onClick={() => setMapOpen(false)}>Отмена</button><button type="submit" className="is-primary" disabled={busy || !externalLocationId}>Сопоставить</button></footer></form></div> : null}
    </section>
  );
}
