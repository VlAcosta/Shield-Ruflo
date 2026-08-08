import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { REVIEW_RESPONSE_MODES, REVIEW_TONE_PRESETS } from '../../model/reviewData';

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="reviews-settings__toggleRow">
      <div><strong>{label}</strong><span>{description}</span></div>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export default function ReviewSettingsModal({ open, settings, onClose, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);
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
    try { await onSave(draft); onClose(); } finally { setSaving(false); }
  };

  return createPortal(
    <div className="reviews-settings-layer" role="presentation">
      <button type="button" className="reviews-settings-layer__overlay" onClick={onClose} aria-label="Закрыть настройки" />
      <section className="reviews-settings" role="dialog" aria-modal="true" aria-labelledby="reviews-settings-title">
        <header>
          <div>
            <span>REPUTATION POLICY</span>
            <h2 id="reviews-settings-title">Как команда отвечает на отзывы</h2>
            <p>Эти правила применяются ко всей организации и управляют согласованием, тоном ответа и автоматизацией.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="reviews-settings__body">
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
            <div className="reviews-settings__sectionHead"><span>02</span><div><strong>Tone of voice</strong><small>Базовый стиль AI-черновиков и шаблонов команды.</small></div></div>
            <div className="reviews-settings__tones">
              {REVIEW_TONE_PRESETS.map((tone) => (
                <button key={tone.id} type="button" className={draft.tonePreset === tone.id ? 'is-active' : ''} onClick={() => setDraft((current) => ({ ...current, tonePreset: tone.id }))}>
                  <strong>{tone.label}</strong><span>{tone.description}</span>
                </button>
              ))}
            </div>
            <label className="reviews-settings__instruction">
              <span>Инструкция бренда</span>
              <textarea value={draft.toneInstruction || ''} onChange={(event) => setDraft((current) => ({ ...current, toneInstruction: event.target.value }))} maxLength={500} rows={4} />
              <small>{(draft.toneInstruction || '').length}/500</small>
            </label>
          </section>

          <section>
            <div className="reviews-settings__sectionHead"><span>03</span><div><strong>Автоматизация</strong><small>Система сама подхватывает рутинные действия.</small></div></div>
            <div className="reviews-settings__toggles">
              <div className="reviews-settings__automationLink"><div><strong>Задачи, SLA и эскалации</strong><span>Теперь сценарии настраиваются в отдельном Automation Engine: условия, площадки, причины и действия.</span></div><a href="/automations">Открыть автоматизации →</a></div>
              <Toggle checked={Boolean(draft.aiReasonsEnabled)} onChange={(value) => setDraft((current) => ({ ...current, aiReasonsEnabled: value }))} label="Определять причины негатива" description="AI размечает качество, персонал, доставку, цену и другие причины." />
              <Toggle checked={Boolean(draft.legalEscalationEnabled)} onChange={(value) => setDraft((current) => ({ ...current, legalEscalationEnabled: value }))} label="Юридическая эскалация" description="Разрешить передачу спорных отзывов в юридический workflow." />
            </div>
          </section>

          <section>
            <div className="reviews-settings__sectionHead"><span>04</span><div><strong>SLA ответа</strong><small>Текущая политика реакции по рейтингу.</small></div></div>
            <div className="reviews-settings__sla">
              <div><strong>1–2★</strong><span>Негатив</span><b>6 часов</b></div>
              <div><strong>3★</strong><span>Негатив</span><b>16 часов</b></div>
              <div><strong>4–5★</strong><span>Нейтрально / позитив</span><b>24 часа</b></div>
            </div>
          </section>
        </div>

        <footer>
          <span>Настройки применяются ко всем пяти основным площадкам.</span>
          <div><button type="button" onClick={onClose}>Отмена</button><button type="button" className="is-primary" onClick={submit} disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить политику'}</button></div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
