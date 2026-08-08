import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackspaceIcon, ShieldMiniIcon } from '../icons';
import { PIN_CODE_KEY, PIN_LENGTH, PIN_UNLOCK_KEY } from '../constants';

function PinDots({ count }) {
  return (
    <div className="portal-pin__dots" aria-label={`Введено ${count} из ${PIN_LENGTH} цифр`}>
      {Array.from({ length: PIN_LENGTH }, (_, index) => (
        <span key={index} className={index < count ? 'is-filled' : ''} />
      ))}
    </div>
  );
}

function PinPad({ onDigit, onDelete }) {
  const keys = useMemo(() => ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'], []);

  return (
    <div className="portal-pin__pad">
      {keys.map((key, index) => {
        if (!key) return <span key={`empty-${index}`} />;

        const isDelete = key === 'delete';
        return (
          <button
            key={key}
            type="button"
            className={isDelete ? 'portal-pin__delete' : ''}
            onClick={() => (isDelete ? onDelete() : onDigit(key))}
            aria-label={isDelete ? 'Удалить цифру' : `Цифра ${key}`}
          >
            {isDelete ? <BackspaceIcon /> : key}
          </button>
        );
      })}
    </div>
  );
}

function PinOverlay({ onUnlock, reason = '' }) {
  const cardRef = useRef(null);
  const completionTimer = useRef(null);
  const shakeTimer = useRef(null);

  const [savedPin, setSavedPin] = useState(() => localStorage.getItem(PIN_CODE_KEY) || '');
  const [mode, setMode] = useState(() => (localStorage.getItem(PIN_CODE_KEY) ? 'enter' : 'create'));
  const [pin, setPin] = useState('');
  const [draftPin, setDraftPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    document.body.classList.add('portal-pin-active');

    const focusTimer = window.setTimeout(() => {
      cardRef.current?.focus();
    }, 0);

    return () => {
      document.body.classList.remove('portal-pin-active');
      window.clearTimeout(focusTimer);
      window.clearTimeout(completionTimer.current);
      window.clearTimeout(shakeTimer.current);
    };
  }, []);

  const triggerError = useCallback((message) => {
    setError(message);
    setShake(true);
    window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 360);
  }, []);

  const completePin = useCallback((value) => {
    if (mode === 'create') {
      setDraftPin(value);
      setPin('');
      setMode('confirm');
      return;
    }

    if (mode === 'confirm') {
      if (value !== draftPin) {
        setPin('');
        setDraftPin('');
        setMode('create');
        triggerError('PIN-коды не совпадают');
        return;
      }

      localStorage.setItem(PIN_CODE_KEY, value);
      localStorage.setItem(PIN_UNLOCK_KEY, '1');
      setSavedPin(value);
      onUnlock();
      return;
    }

    if (value === savedPin) {
      localStorage.setItem(PIN_UNLOCK_KEY, '1');
      onUnlock();
      return;
    }

    setPin('');
    triggerError('Неверный PIN');
  }, [draftPin, mode, onUnlock, savedPin, triggerError]);

  const handleDigit = useCallback((digit) => {
    setError('');
    setPin((current) => {
      if (current.length >= PIN_LENGTH) return current;

      const next = `${current}${digit}`;
      if (next.length === PIN_LENGTH) {
        window.clearTimeout(completionTimer.current);
        completionTimer.current = window.setTimeout(() => completePin(next), 90);
      }
      return next;
    });
  }, [completePin]);

  const handleDelete = useCallback(() => {
    setError('');
    setPin((current) => current.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError('');
    setPin('');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          cardRef.current?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])') || []
        );

        if (!focusable.length) {
          event.preventDefault();
          cardRef.current?.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || active === cardRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const digitFromKey = /^\d$/.test(event.key) ? event.key : null;
      const digitFromCode = /^Numpad\d$/.test(event.code) ? event.code.replace('Numpad', '') : null;
      const digit = digitFromKey ?? digitFromCode;

      if (digit) {
        event.preventDefault();
        handleDigit(digit);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        handleDelete();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        handleClear();
        return;
      }

      if (event.key === 'Enter' && pin.length === PIN_LENGTH) {
        event.preventDefault();
        window.clearTimeout(completionTimer.current);
        completePin(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [completePin, handleClear, handleDelete, handleDigit, pin]);

  const title = mode === 'create' ? 'Создайте PIN' : mode === 'confirm' ? 'Повторите PIN' : 'Введите PIN';
  const subtitle = mode === 'create'
    ? 'Установите 4-значный код для защиты кабинета'
    : mode === 'confirm'
      ? 'Повторите код для подтверждения'
      : reason === 'inactivity'
        ? 'Кабинет автоматически заблокирован из-за бездействия'
        : 'Для доступа к кабинету Бизнес Щит';

  return (
    <div className="portal-pin" role="dialog" aria-modal="true" aria-labelledby="portal-pin-title">
      <div className="portal-pin__backdrop" />
      <div ref={cardRef} tabIndex={-1} className={`portal-pin__card ${shake ? 'is-shaking' : ''}`}>
        <div className="portal-pin__icon"><ShieldMiniIcon /></div>
        <h2 id="portal-pin-title">{title}</h2>
        <p>{subtitle}</p>
        {mode === 'enter' && reason === 'inactivity' ? (
          <span className="portal-pin__auto-lock-note">Автоблокировка сработала по настроенной политике безопасности</span>
        ) : null}
        <PinDots count={pin.length} />
        {error ? <div className="portal-pin__error" role="alert">{error}</div> : null}
        <PinPad onDigit={handleDigit} onDelete={handleDelete} />
        <span className="portal-pin__keyboard-hint">Можно вводить цифрами с клавиатуры или NumPad</span>
        {mode === 'enter' ? (
          <span className="portal-pin__hint">Изменить PIN можно в Профиль → Безопасность</span>
        ) : null}
      </div>
    </div>
  );
}

export default memo(PinOverlay);
