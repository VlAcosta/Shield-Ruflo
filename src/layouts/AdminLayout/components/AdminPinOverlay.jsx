import React, { useEffect, useRef, useState } from 'react';
import { BackspaceIcon } from '../icons';
import BrandMark from '../../../components/brand/BrandMark';

const PIN_LENGTH = 4;
const DEFAULT_PIN = '4321';

export default function AdminPinOverlay({ onUnlock }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const cardRef = useRef(null);
  const expectedPin = localStorage.getItem('business-shield:admin-pin') || process.env.REACT_APP_ADMIN_PIN || DEFAULT_PIN;

  const verify = (nextValue) => {
    if (nextValue.length !== PIN_LENGTH) return;
    if (nextValue === expectedPin) {
      setError('');
      onUnlock();
      return;
    }
    setError('Неверный PIN-код');
    setValue('');
    cardRef.current?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
      { duration: 260, easing: 'ease-out' }
    );
  };

  const addDigit = (digit) => {
    setError('');
    setValue((current) => {
      if (current.length >= PIN_LENGTH) return current;
      const next = `${current}${digit}`;
      window.setTimeout(() => verify(next), 0);
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        addDigit(event.key);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        setValue((current) => current.slice(0, -1));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setValue('');
        setError('');
      } else if (event.key === 'Enter') {
        event.preventDefault();
        verify(value);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value]);

  return (
    <div className="admin-pin" role="dialog" aria-modal="true" aria-labelledby="admin-pin-title">
      <div className="admin-pin__backdrop" />
      <div ref={cardRef} className="admin-pin__card">
        <div className="admin-pin__brand">
          <BrandMark size={34} />
          <span>БИЗНЕС<br/>ЩИТ</span>
          <em>ADMIN</em>
        </div>
        <span className="admin-pin__eyebrow">Admin CRM</span>
        <h2 id="admin-pin-title">Введите администраторский PIN</h2>
        <div className="admin-pin__dots" aria-label={`Введено ${value.length} из ${PIN_LENGTH} цифр`}>
          {Array.from({ length: PIN_LENGTH }).map((_, index) => <i key={index} className={index < value.length ? 'is-filled' : ''} />)}
        </div>
        {error ? <p className="admin-pin__error">{error}</p> : <p className="admin-pin__hint">Можно использовать цифровой ряд и NumPad</p>}
        <div className="admin-pin__pad">
          {[1,2,3,4,5,6,7,8,9].map((digit) => <button type="button" key={digit} onClick={() => addDigit(String(digit))}>{digit}</button>)}
          <span />
          <button type="button" onClick={() => addDigit('0')}>0</button>
          <button type="button" className="admin-pin__backspace" onClick={() => setValue((current) => current.slice(0, -1))} aria-label="Удалить цифру"><BackspaceIcon /></button>
        </div>
      </div>
    </div>
  );
}
