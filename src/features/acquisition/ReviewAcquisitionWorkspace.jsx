import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  createAcquisitionCampaign,
  createAcquisitionInvite,
  getAcquisitionMetrics,
  listAcquisitionCampaigns,
  updateAcquisitionCampaign,
} from '../../services/acquisition/acquisitionService';
import './ReviewAcquisitionWorkspace.scss';

const STATUS_LABELS = { draft: 'Черновик', active: 'Активна', paused: 'Пауза', archived: 'Архив' };
const CHANNEL_LABELS = { qr: 'QR', link: 'Ссылка', email: 'Email link', sms: 'SMS link', whatsapp: 'WhatsApp link', other: 'Другое' };

function percent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function metricValue(value, suffix = '') {
  return value === null || value === undefined ? '—' : `${value}${suffix}`;
}

function publicUrl(campaign) {
  if (!campaign) return '';
  return `${window.location.origin}${campaign.publicPath}`;
}

function CreateCampaignModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('Расскажите о вашем опыте');
  const [googleUrl, setGoogleUrl] = useState('');
  const [secondLabel, setSecondLabel] = useState('');
  const [secondUrl, setSecondUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setHeadline('Расскажите о вашем опыте');
    setGoogleUrl('');
    setSecondLabel('');
    setSecondUrl('');
    setError('');
  }, [open]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const targets = [];
      if (googleUrl.trim()) targets.push({ provider: 'google-business-profile', label: 'Google', url: googleUrl.trim(), priority: 10, enabled: true });
      if (secondLabel.trim() && secondUrl.trim()) targets.push({ provider: 'other', label: secondLabel.trim(), url: secondUrl.trim(), priority: 20, enabled: true });
      const result = await createAcquisitionCampaign({
        name: name.trim(),
        headline: headline.trim(),
        channel: 'QR',
        collectContact: true,
        caseBelowRating: 2,
        targets,
      });
      onCreated(result.campaign);
      onClose();
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось создать кампанию');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="acq-modal-layer" role="presentation">
      <button type="button" className="acq-modal-layer__overlay" onClick={onClose} aria-label="Закрыть" />
      <form className="acq-modal" onSubmit={submit}>
        <header><div><span>NEW ACQUISITION CAMPAIGN</span><h2>Новая кампания</h2></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
        <label><span>Название кампании</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={180} placeholder="QR на кассе · Тула" required /></label>
        <label><span>Заголовок публичной формы</span><input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={240} required /></label>
        <div className="acq-modal__target"><strong>Публичные площадки</strong><small>Они будут доступны всем посетителям независимо от поставленной оценки.</small></div>
        <label><span>Google review URL</span><input type="url" value={googleUrl} onChange={(event) => setGoogleUrl(event.target.value)} placeholder="https://..." /></label>
        <div className="acq-modal__row"><label><span>Вторая площадка</span><input value={secondLabel} onChange={(event) => setSecondLabel(event.target.value)} placeholder="Яндекс / 2ГИС / Trustpilot" /></label><label><span>URL</span><input type="url" value={secondUrl} onChange={(event) => setSecondUrl(event.target.value)} placeholder="https://..." /></label></div>
        {error ? <div className="acq-modal__error" role="alert">{error}</div> : null}
        <footer><button type="button" onClick={onClose}>Отмена</button><button type="submit" className="is-primary" disabled={submitting}>{submitting ? 'Создаём…' : 'Создать'}</button></footer>
      </form>
    </div>
  );
}

export default function ReviewAcquisitionWorkspace() {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const payload = await listAcquisitionCampaigns({ limit: 100 }, { signal });
      setCampaigns(payload.items || []);
      setSelectedId((current) => current && payload.items.some((item) => item.id === current) ? current : payload.items[0]?.id || '');
    } catch (nextError) {
      if (nextError?.name !== 'AbortError') setError(nextError?.message || 'Не удалось загрузить кампании');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selected = campaigns.find((item) => item.id === selectedId) || null;
  const selectedPublicUrl = useMemo(() => publicUrl(selected), [selected]);

  useEffect(() => {
    if (!selected) {
      setMetrics(null);
      setQrDataUrl('');
      return undefined;
    }
    const controller = new AbortController();
    getAcquisitionMetrics(selected.id, { signal: controller.signal }).then(setMetrics).catch((nextError) => {
      if (nextError?.name !== 'AbortError') setError(nextError?.message || 'Не удалось загрузить метрики');
    });
    QRCode.toDataURL(selectedPublicUrl, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
    setInvite(null);
    return () => controller.abort();
  }, [selected?.id, selectedPublicUrl]);

  const replaceCampaign = (next) => {
    setCampaigns((current) => current.some((item) => item.id === next.id)
      ? current.map((item) => item.id === next.id ? next : item)
      : [next, ...current]);
    setSelectedId(next.id);
  };

  const mutate = async (operation) => {
    if (!selected || mutating) return;
    setMutating(true);
    setError('');
    try {
      const result = await operation(selected);
      if (result?.campaign) replaceCampaign(result.campaign);
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось изменить кампанию');
    } finally {
      setMutating(false);
    }
  };

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setError('Браузер не разрешил скопировать ссылку. Выделите её вручную.');
    }
  };

  const createInvite = async () => {
    if (!selected || mutating) return;
    setMutating(true);
    setError('');
    try {
      const result = await createAcquisitionInvite(selected.id, { channel: 'LINK', expiresInDays: 30 });
      setInvite({ ...result.invite, url: `${window.location.origin}${result.invite.publicPath}` });
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось создать персональную ссылку');
    } finally {
      setMutating(false);
    }
  };

  const summary = useMemo(() => ({
    active: campaigns.filter((item) => item.status === 'active').length,
    views: metrics?.views ?? 0,
    feedback: metrics?.feedbackSubmitted ?? 0,
    clicks: metrics?.publicReviewTargetClicks ?? 0,
  }), [campaigns, metrics]);

  return (
    <section className="acq-workspace">
      <header className="acq-hero">
        <div><span>REVIEW ACQUISITION</span><h1>Собирайте больше честной обратной связи</h1><p>QR и безопасные ссылки приводят клиента на first-party форму и публичные площадки. Business Shield измеряет конверсию и превращает низкие оценки в Reputation Cases — без review gating.</p></div>
        <button type="button" onClick={() => setCreateOpen(true)}>+ Новая кампания</button>
      </header>

      <div className="acq-policy"><strong>Compliance by design</strong><span>Никаких скидок за отзывы, скрытия негативных площадок или показа Google только довольным клиентам. Публичные площадки доступны для любой оценки.</span></div>

      <div className="acq-scorecards">
        <div><span>Активные кампании</span><strong>{summary.active}</strong><small>из {campaigns.length}</small></div>
        <div><span>Просмотры</span><strong>{summary.views}</strong><small>выбранная кампания</small></div>
        <div><span>First-party feedback</span><strong>{summary.feedback}</strong><small>{metrics ? percent(metrics.feedbackConversion) : '—'} конверсия</small></div>
        <div><span>Переходы на площадки</span><strong>{summary.clicks}</strong><small>{metrics ? percent(metrics.publicReviewClickConversion) : '—'} от просмотров</small></div>
      </div>

      {error ? <div className="acq-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>×</button></div> : null}

      {loading ? <div className="acq-loading" role="status"><i /><span>Загружаем кампании…</span></div> : !campaigns.length ? (
        <div className="acq-empty"><span>START ACQUISITION</span><h2>Создайте первую QR-кампанию</h2><p>Добавьте публичные площадки, включите форму и разместите QR на кассе, чеке, столе или после оказания услуги.</p><button type="button" onClick={() => setCreateOpen(true)}>Создать кампанию</button></div>
      ) : (
        <div className="acq-grid">
          <aside className="acq-list">
            <div className="acq-list__head"><strong>Кампании</strong><span>{campaigns.length}</span></div>
            {campaigns.map((campaign) => (
              <button key={campaign.id} type="button" className={selected?.id === campaign.id ? 'is-selected' : ''} onClick={() => setSelectedId(campaign.id)}>
                <div><span className={`acq-status is-${campaign.status}`}>{STATUS_LABELS[campaign.status]}</span><small>{CHANNEL_LABELS[campaign.channel] || campaign.channel}</small></div>
                <strong>{campaign.name}</strong>
                <p>{campaign.location?.name || 'Все локации'} · {campaign.targets.length} площадок</p>
              </button>
            ))}
          </aside>

          {selected ? (
            <article className="acq-detail">
              <header className="acq-detail__head">
                <div><div><span className={`acq-status is-${selected.status}`}>{STATUS_LABELS[selected.status]}</span><span>{CHANNEL_LABELS[selected.channel] || selected.channel}</span></div><h2>{selected.name}</h2><p>{selected.headline}</p></div>
                <div className="acq-detail__actions">
                  {selected.status !== 'active' ? <button type="button" className="is-primary" disabled={mutating || !selected.targets.some((target) => target.enabled !== false)} onClick={() => mutate((item) => updateAcquisitionCampaign(item.id, { status: 'ACTIVE' }))}>Запустить</button> : <button type="button" disabled={mutating} onClick={() => mutate((item) => updateAcquisitionCampaign(item.id, { status: 'PAUSED' }))}>Поставить на паузу</button>}
                </div>
              </header>

              <div className="acq-detail__columns">
                <section className="acq-panel acq-panel--qr">
                  <div className="acq-panel__title"><span>01</span><div><strong>QR и публичная ссылка</strong><small>Одна честная точка входа для всех клиентов.</small></div></div>
                  <div className="acq-qr">{qrDataUrl ? <img src={qrDataUrl} alt={`QR-код кампании ${selected.name}`} /> : <div>QR</div>}<div><span>Публичный URL</span><code>{selectedPublicUrl}</code><button type="button" onClick={() => copy(selectedPublicUrl, 'public')}>{copied === 'public' ? 'Скопировано ✓' : 'Копировать ссылку'}</button></div></div>
                  <div className="acq-targets"><strong>Площадки</strong>{selected.targets.length ? selected.targets.map((target) => <div key={target.id}><span>{target.label}</span><small>{target.provider}</small></div>) : <p>Добавьте хотя бы одну публичную площадку перед запуском.</p>}</div>
                </section>

                <section className="acq-panel">
                  <div className="acq-panel__title"><span>02</span><div><strong>Конверсия</strong><small>Последние 30 дней.</small></div></div>
                  <div className="acq-metrics">
                    <div><span>Feedback conversion</span><strong>{metrics ? percent(metrics.feedbackConversion) : '—'}</strong></div>
                    <div><span>Public review clicks</span><strong>{metrics ? percent(metrics.publicReviewClickConversion) : '—'}</strong></div>
                    <div><span>Средняя оценка</span><strong>{metricValue(metrics?.averageFirstPartyRating, '★')}</strong></div>
                    <div><span>Открыто кейсов</span><strong>{metrics?.casesOpened ?? '—'}</strong></div>
                  </div>
                  <div className="acq-rating-bars">{[5, 4, 3, 2, 1].map((rating) => { const item = metrics?.ratingBreakdown?.find((row) => row.rating === rating); const max = Math.max(1, ...(metrics?.ratingBreakdown || []).map((row) => row.count)); const width = `${Math.round(((item?.count || 0) / max) * 100)}%`; return <div key={rating}><span>{rating}★</span><i><b style={{ width }} /></i><strong>{item?.count || 0}</strong></div>; })}</div>
                </section>
              </div>

              <section className="acq-invite">
                <div><span>PERSONAL LINK</span><h3>Создать одноразовую ссылку для клиента</h3><p>Shield создаёт защищённый token-link. Пока delivery adapter не подключён, система честно не помечает Email/SMS как отправленный.</p></div>
                <button type="button" disabled={mutating} onClick={createInvite}>Создать ссылку</button>
                {invite ? <div className="acq-invite__result"><code>{invite.url}</code><button type="button" onClick={() => copy(invite.url, 'invite')}>{copied === 'invite' ? 'Скопировано ✓' : 'Копировать'}</button><small>Доставка: {invite.delivery.status} · {invite.delivery.reason}</small></div> : null}
              </section>
            </article>
          ) : null}
        </div>
      )}

      <CreateCampaignModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={replaceCampaign} />
    </section>
  );
}
