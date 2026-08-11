import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  acquisitionPublicApiPath,
  getPublicAcquisitionCampaign,
  submitAcquisitionFeedback,
} from '../services/acquisition/acquisitionService';
import './ReviewAcquisitionLandingPage.scss';

function StarRating({ value, onChange, disabled }) {
  return (
    <div className="acq-public-stars" role="radiogroup" aria-label="Оценка от одного до пяти">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} из 5`}
          className={rating <= value ? 'is-active' : ''}
          onClick={() => onChange(rating)}
          disabled={disabled}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function PublicTargets({ slug, targets, invite, session }) {
  if (!targets?.length) return null;
  return (
    <section className="acq-public-targets" aria-labelledby="public-review-targets-title">
      <span className="acq-public-eyebrow">PUBLIC REVIEW</span>
      <h2 id="public-review-targets-title">Хотите поделиться отзывом публично?</h2>
      <p>Выберите удобную площадку. Этот список доступен всем посетителям независимо от оценки выше.</p>
      <div>
        {targets.map((target) => (
          <a
            key={target.id}
            href={acquisitionPublicApiPath(slug, `/targets/${encodeURIComponent(target.id)}`, {
              ...(invite ? { invite } : {}),
              session,
            })}
            target="_blank"
            rel="noreferrer"
          >
            <span>{target.label}</span>
            <strong>Открыть →</strong>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function ReviewAcquisitionLandingPage() {
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const invite = searchParams.get('invite') || '';
  const sessionRef = useRef(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const session = sessionRef.current;
  const [campaign, setCampaign] = useState(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getPublicAcquisitionCampaign(slug, {
      ...(invite ? { invite } : {}),
      session,
    }, { signal: controller.signal })
      .then((payload) => setCampaign(payload.campaign))
      .catch((nextError) => {
        if (nextError?.name !== 'AbortError') setError(nextError?.message || 'Страница обратной связи недоступна');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [invite, session, slug]);

  const targets = useMemo(() => submitted?.publicReviewTargets || campaign?.publicReviewTargets || [], [campaign?.publicReviewTargets, submitted?.publicReviewTargets]);

  const submit = async (event) => {
    event.preventDefault();
    if (!rating || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await submitAcquisitionFeedback(slug, {
        rating,
        text: text.trim(),
        consentToContact: Boolean(campaign?.collectContact && consent),
        ...(campaign?.collectContact && consent && contactName.trim() ? { contactName: contactName.trim() } : {}),
        ...(campaign?.collectContact && consent && contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
        ...(campaign?.collectContact && consent && contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        ...(invite ? { invite } : {}),
        session,
      });
      setSubmitted(result);
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось отправить обратную связь');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="acq-public-state" role="status"><span className="acq-public-loader" /><strong>Открываем форму обратной связи…</strong></main>;
  }

  if (!campaign) {
    return (
      <main className="acq-public-state acq-public-state--error" role="alert">
        <span>BUSINESS SHIELD</span>
        <h1>Страница недоступна</h1>
        <p>{error || 'Кампания завершена или ссылка больше не действует.'}</p>
      </main>
    );
  }

  return (
    <main className="acq-public-page">
      <div className="acq-public-shell">
        <header className="acq-public-brand">
          <strong>Бизнес Щит</strong>
          <span>Проверенная обратная связь</span>
        </header>

        <section className="acq-public-intro">
          <span className="acq-public-eyebrow">YOUR EXPERIENCE</span>
          <h1>{campaign.headline}</h1>
          <p>{campaign.description || 'Ваше мнение помогает команде увидеть реальные проблемы и закрепить то, что работает хорошо.'}</p>
          {campaign.location ? <small>{[campaign.location.name, campaign.location.city].filter(Boolean).join(' · ')}</small> : null}
        </section>

        <div className="acq-public-grid">
          <section className="acq-public-feedback">
            {submitted ? (
              <div className="acq-public-thanks" aria-live="polite">
                <i>✓</i>
                <span className="acq-public-eyebrow">FEEDBACK RECEIVED</span>
                <h2>{submitted.thankYouMessage || campaign.thankYouMessage}</h2>
                <p>Обратная связь принята. Публичные площадки справа остаются доступными независимо от поставленной оценки.</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="acq-public-step"><span>01</span><div><strong>Как бы вы оценили опыт?</strong><small>Выберите от 1 до 5 звёзд.</small></div></div>
                <StarRating value={rating} onChange={setRating} disabled={submitting} />

                <label className="acq-public-textarea">
                  <span>Что было хорошо или что стоит улучшить?</span>
                  <textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} maxLength={5000} placeholder="Расскажите о вашем опыте своими словами…" />
                  <small>{text.length}/5000</small>
                </label>

                {campaign.collectContact ? (
                  <section className="acq-public-contact">
                    <label className="acq-public-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Можно связаться со мной, чтобы уточнить детали</span></label>
                    {consent ? (
                      <div className="acq-public-contact__fields">
                        <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Имя" maxLength={180} />
                        <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="Email" maxLength={320} />
                        <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Телефон" maxLength={64} />
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {error ? <div className="acq-public-error" role="alert">{error}</div> : null}
                <button type="submit" className="acq-public-submit" disabled={!rating || submitting}>{submitting ? 'Отправляем…' : 'Отправить обратную связь'}</button>
                <p className="acq-public-privacy">Контактные данные сохраняются только при явном согласии. Ваша оценка не влияет на доступность публичных площадок для отзывов.</p>
              </form>
            )}
          </section>

          <PublicTargets slug={slug} targets={targets} invite={invite} session={session} />
        </div>

        <footer className="acq-public-footer"><span>Powered by Business Shield</span><small>Без вознаграждений за отзывы · без фильтрации по оценке</small></footer>
      </div>
    </main>
  );
}
