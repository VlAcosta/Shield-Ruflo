import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { REVIEW_RESPONSE_MODES, REVIEW_TONE_PRESETS } from '../../model/reviewData';
import {
  getBrandVoice,
  getReplyAutopilot,
  saveBrandVoice,
  saveReplyAutopilot,
} from '../../../../services/reviews/replyCopilotService';

const DEFAULT_BRAND_VOICE = {
  tone: 'PROFESSIONAL',
  formality: 'BALANCED',
  primaryLanguage: 'ru',
  responseLength: 'MEDIUM',
  greetingStyle: '',
  signature: '',
  preferredPhrases: [],
  prohibitedPhrases: [],
  legalDisclaimer: '',
  compensationPolicy: 'REQUIRE_APPROVAL',
  escalationTriggers: [],
  customInstructions: '',
};

const DEFAULT_AUTOPILOT = {
  enabled: false,
  minimumRating: 4,
  maximumReputationRisk: 20,
  minimumAiConfidence: 0.95,
};

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className="reviews-settings__toggleRow">
      <div><strong>{label}</strong><span>{description}</span></div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <i aria-hidden="true" />
    </label>
  );
}

function lines(value) {
  return (Array.isArray(value) ? value : []).join('\n');
}

function toLines(value) {
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 50);
}

export default function ReviewSettingsModal({ open, settings, onClose, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [brandVoice, setBrandVoice] = useState(DEFAULT_BRAND_VOICE);
  const [autopilot, setAutopilot] = useState(DEFAULT_AUTOPILOT);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setLoadingRemote(true);
    setError('');
    Promise.all([
      getBrandVoice({ signal: controller.signal }),
      getReplyAutopilot({ signal: controller.signal }),
    ])
      .then(([voice, policy]) => {
        setBrandVoice({ ...DEFAULT_BRAND_VOICE, ...(voice?.profile || {}) });
        setAutopilot({ ...DEFAULT_AUTOPILOT, ...(policy?.policy || {}) });
      })
      .catch((requestError) => {
        if (requestError?.name !== 'AbortError') setError(requestError?.message || 'Не удалось загрузить AI-политику организации');
      })
      .finally(() => setLoadingRemote(false));
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = old; window.removeEventListener('keydown', onKey); };
  }, [onClose, open]);

  if (!open || !draft) return null;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await Promise.all([
        onSave(draft),
        saveBrandVoice(brandVoice),
        saveReplyAutopilot(autopilot),
      ]);
      onClose();
    } catch (saveError) {
      setError(saveError?.message || 'Не удалось сохранить политику');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="reviews-settings-layer" role="presentation">
      <button type="button" className="reviews-settings-layer__overlay" onClick={onClose} aria-label="Закрыть настройки" />
      <section className="reviews-settings" role="dialog" aria-modal="true" aria-labelledby="reviews-settings-title">
        <header>
          <div>
            <span>REPUTATION POLICY</span>
            <h2 id="reviews-settings-title">Как команда отвечает на отзывы</h2>
            <p>Правила организации для согласования, Brand Voice, AI Reply Copilot и безопасной автопубликации.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="reviews-settings__body">
          {error ? <div className="reviews-ai-state is-danger"><strong>Настройки не сохранены</strong><span>{error}</span></div> : null}
          {loadingRemote ? <div className="reviews-ai-state is-muted"><strong>Загружаем AI-политику…</strong><span>Brand Voice и Autopilot читаются с сервера организации.</span></div> : null}

          <section>
            <div className="reviews-settings__sectionHead"><span>01</span><div><strong>Режим работы</strong><small>Выберите, кто отвечает за публикацию.</small></div></div>
            <div className="reviews-settings__modes">
              {REVIEW_RESPONSE_MODES.map((mode) => (
                <button key={mode.id} type="button" className={draft.responseMode === mode.id ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, responseMode: mode.id }))}>
                  <i>{draft.responseMode === mode.id ? '✓' : ''}</i>
                  <strong>{mode.label}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="reviews-settings__sectionHead"><span>02</span><div><strong>Brand Voice</strong><small>Серверная политика тона для AI Reply Copilot.</small></div></div>
            <div className="reviews-settings__brandGrid">
              <label><span>Тон</span><select value={brandVoice.tone} onChange={(event) => setBrandVoice((current) => ({ ...current, tone: event.target.value }))}><option value="PROFESSIONAL">Профессиональный</option><option value="FRIENDLY">Дружелюбный</option><option value="PREMIUM">Премиальный</option><option value="NEUTRAL">Нейтральный</option><option value="EMPATHETIC">Эмпатичный</option><option value="CUSTOM">Свой</option></select></label>
              <label><span>Формальность</span><select value={brandVoice.formality} onChange={(event) => setBrandVoice((current) => ({ ...current, formality: event.target.value }))}><option value="FORMAL">Формально</option><option value="BALANCED">Сбалансированно</option><option value="CASUAL">Свободно</option></select></label>
              <label><span>Длина</span><select value={brandVoice.responseLength} onChange={(event) => setBrandVoice((current) => ({ ...current, responseLength: event.target.value }))}><option value="SHORT">Короткая</option><option value="MEDIUM">Средняя</option><option value="DETAILED">Подробная</option></select></label>
              <label><span>Язык</span><input value={brandVoice.primaryLanguage} onChange={(event) => setBrandVoice((current) => ({ ...current, primaryLanguage: event.target.value }))} maxLength={16} /></label>
            </div>
            <label className="reviews-settings__instruction"><span>Дополнительная инструкция бренда</span><textarea value={brandVoice.customInstructions} onChange={(event) => setBrandVoice((current) => ({ ...current, customInstructions: event.target.value }))} maxLength={4000} rows={4} /><small>{brandVoice.customInstructions.length}/4000</small></label>
            <div className="reviews-settings__brandGrid">
              <label><span>Приветствие</span><input value={brandVoice.greetingStyle} onChange={(event) => setBrandVoice((current) => ({ ...current, greetingStyle: event.target.value }))} maxLength={240} /></label>
              <label><span>Подпись</span><input value={brandVoice.signature} onChange={(event) => setBrandVoice((current) => ({ ...current, signature: event.target.value }))} maxLength={240} /></label>
              <label><span>Обещания компенсации</span><select value={brandVoice.compensationPolicy} onChange={(event) => setBrandVoice((current) => ({ ...current, compensationPolicy: event.target.value }))}><option value="FORBID">Запрещать</option><option value="REQUIRE_APPROVAL">Только после согласования</option><option value="ALLOW">Разрешать политикой</option></select></label>
            </div>
            <label className="reviews-settings__instruction"><span>Запрещённые фразы — по одной на строку</span><textarea value={lines(brandVoice.prohibitedPhrases)} onChange={(event) => setBrandVoice((current) => ({ ...current, prohibitedPhrases: toLines(event.target.value) }))} rows={3} maxLength={3000} /></label>
            <label className="reviews-settings__instruction"><span>Предпочтительные фразы — по одной на строку</span><textarea value={lines(brandVoice.preferredPhrases)} onChange={(event) => setBrandVoice((current) => ({ ...current, preferredPhrases: toLines(event.target.value) }))} rows={3} maxLength={3000} /></label>
          </section>

          <section>
            <div className="reviews-settings__sectionHead"><span>03</span><div><strong>AI Autopilot</strong><small>Автопубликация выключена по умолчанию и работает только в безопасном коридоре.</small></div></div>
            <div className="reviews-settings__toggles">
              <Toggle checked={Boolean(autopilot.enabled)} onChange={(value) => setAutopilot((current) => ({ ...current, enabled: value }))} label="Разрешить безопасную автопубликацию" description="1★, legal/PR, safety, низкая уверенность и policy warnings никогда не проходят в Autopilot." disabled={loadingRemote} />
            </div>
            <div className="reviews-settings__brandGrid">
              <label><span>Минимальный рейтинг</span><input type="number" min="1" max="5" value={autopilot.minimumRating} onChange={(event) => setAutopilot((current) => ({ ...current, minimumRating: Number(event.target.value) }))} /></label>
              <label><span>Макс. репутационный риск</span><input type="number" min="0" max="100" value={autopilot.maximumReputationRisk} onChange={(event) => setAutopilot((current) => ({ ...current, maximumReputationRisk: Number(event.target.value) }))} /></label>
              <label><span>Мин. AI confidence</span><input type="number" min="0" max="1" step="0.01" value={autopilot.minimumAiConfidence} onChange={(event) => setAutopilot((current) => ({ ...current, minimumAiConfidence: Number(event.target.value) }))} /></label>
            </div>
            <div className="reviews-ai-state is-warning"><strong>Высокорисковые отзывы не публикуются автоматически</strong><span>Даже при включённом Autopilot решение остаётся server-authoritative и повторно проверяется policy engine.</span></div>
          </section>

          <section>
            <div className="reviews-settings__sectionHead"><span>04</span><div><strong>Операционные правила</strong><small>Существующие SLA, причины и эскалации.</small></div></div>
            <div className="reviews-settings__tones">
              {REVIEW_TONE_PRESETS.map((tone) => (
                <button key={tone.id} type="button" className={draft.tonePreset === tone.id ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, tonePreset: tone.id }))}>
                  <strong>{tone.label}</strong><span>{tone.description}</span>
                </button>
              ))}
            </div>
            <div className="reviews-settings__toggles">
              <div className="reviews-settings__automationLink"><div><strong>Задачи, SLA и эскалации</strong><span>Сценарии настраиваются в Automation Engine: условия, площадки, причины и действия.</span></div><a href="/automations">Открыть автоматизации →</a></div>
              <Toggle checked={Boolean(draft.aiReasonsEnabled)} onChange={(value) => setDraft((current) => ({ ...current, aiReasonsEnabled: value }))} label="Показывать причины негатива" description="Использовать intelligence-разметку причин в рабочем интерфейсе." />
              <Toggle checked={Boolean(draft.legalEscalationEnabled)} onChange={(value) => setDraft((current) => ({ ...current, legalEscalationEnabled: value }))} label="Юридическая эскалация" description="Разрешить передачу спорных отзывов в юридический workflow." />
            </div>
          </section>

          <section>
            <div className="reviews-settings__sectionHead"><span>05</span><div><strong>SLA ответа</strong><small>Текущая политика реакции по рейтингу.</small></div></div>
            <div className="reviews-settings__sla"><div><strong>1–2★</strong><span>Негатив</span><b>6 часов</b></div><div><strong>3★</strong><span>Негатив</span><b>16 часов</b></div><div><strong>4–5★</strong><span>Нейтрально / позитив</span><b>24 часа</b></div></div>
          </section>
        </div>

        <footer>
          <span>Brand Voice и Autopilot применяются сервером ко всей организации.</span>
          <div><button type="button" onClick={onClose}>Отмена</button><button type="button" className="is-primary" onClick={submit} disabled={saving || loadingRemote}>{saving ? 'Сохраняем…' : 'Сохранить политику'}</button></div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
