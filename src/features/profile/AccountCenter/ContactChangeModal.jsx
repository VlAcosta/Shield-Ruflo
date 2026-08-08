import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { requestContactChange, verifyContactChange } from '../../../services/account/accountService';

const onlyDigits = (value) => String(value || '').replace(/\D/g, '').slice(0, 4);

function validate(type, value) {
  const normalized = String(value || '').trim();
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  return normalized.replace(/\D/g, '').length >= 10;
}

export default function ContactChangeModal({ open, type, currentValue, onClose, onVerified }) {
  const fieldRef = useRef(null);
  const [step, setStep] = useState('value');
  const [value, setValue] = useState(currentValue || '');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isEmail = type === 'email';
  const title = isEmail ? 'Изменить email' : 'Изменить телефон';
  const hint = isEmail
    ? 'На новый адрес придёт код подтверждения.'
    : 'На новый номер придёт SMS с кодом подтверждения.';
  const valueValid = useMemo(() => validate(type, value) && String(value || '').trim() !== String(currentValue || '').trim(), [currentValue, type, value]);

  useEffect(() => {
    if (!open) return;
    setStep('value');
    setValue(currentValue || '');
    setCode('');
    setChallenge(null);
    setBusy(false);
    setError('');
    const timer = window.setTimeout(() => fieldRef.current?.focus(), 80);
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('portal-modal-open');
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('portal-modal-open');
    };
  }, [currentValue, onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const requestCode = async (event) => {
    event?.preventDefault();
    if (!valueValid || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await requestContactChange({ type, value: value.trim() });
      setChallenge(result);
      setStep('code');
      window.setTimeout(() => fieldRef.current?.focus(), 50);
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось отправить код. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event) => {
    event?.preventDefault();
    if (code.length !== 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      await verifyContactChange({
        type,
        value: value.trim(),
        code,
        challengeId: challenge?.challengeId,
      });
      const ok = await onVerified?.(value.trim());
      if (ok !== false) onClose();
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось подтвердить контакт.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="account-contact-modal" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-contact-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="account-contact-title">
        <button className="account-contact-modal__close" type="button" onClick={onClose} aria-label="Закрыть">×</button>

        <div className={`account-contact-modal__mark account-contact-modal__mark--${type}`}>
          {isEmail ? '@' : '+'}
        </div>
        <span className="account-contact-modal__eyebrow">Защищённый контакт</span>
        <h2 id="account-contact-title">{step === 'value' ? title : 'Подтвердите изменение'}</h2>
        <p>{step === 'value' ? hint : `Введите 4-значный код, отправленный на ${value}.`}</p>

        {step === 'value' ? (
          <form onSubmit={requestCode}>
            <label className="account-contact-modal__field">
              <span>{isEmail ? 'Новый email' : 'Новый телефон'}</span>
              <input
                ref={fieldRef}
                type={isEmail ? 'email' : 'tel'}
                inputMode={isEmail ? 'email' : 'tel'}
                value={value}
                onChange={(event) => { setValue(event.target.value); setError(''); }}
                placeholder={isEmail ? 'name@company.ru' : '+7 (999) 000-00-00'}
                autoComplete={isEmail ? 'email' : 'tel'}
              />
            </label>
            {error ? <div className="account-contact-modal__error">{error}</div> : null}
            <div className="account-contact-modal__actions">
              <button type="button" className="is-secondary" onClick={onClose}>Отмена</button>
              <button type="submit" className="is-primary" disabled={!valueValid || busy}>{busy ? 'Отправляем…' : 'Получить код'}</button>
            </div>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <label className="account-contact-modal__field account-contact-modal__field--code">
              <span>Код подтверждения</span>
              <input
                ref={fieldRef}
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(event) => { setCode(onlyDigits(event.target.value)); setError(''); }}
                placeholder="••••"
                maxLength={4}
                autoComplete="one-time-code"
              />
            </label>
            {challenge?.demo ? (
              <div className="account-contact-modal__demo"><i /> Демо-режим · код <strong>1111</strong></div>
            ) : null}
            {error ? <div className="account-contact-modal__error">{error}</div> : null}
            <div className="account-contact-modal__actions">
              <button type="button" className="is-secondary" onClick={() => { setStep('value'); setCode(''); setError(''); }}>Назад</button>
              <button type="submit" className="is-primary" disabled={code.length !== 4 || busy}>{busy ? 'Проверяем…' : 'Подтвердить'}</button>
            </div>
          </form>
        )}
      </section>
    </div>,
    document.body,
  );
}
