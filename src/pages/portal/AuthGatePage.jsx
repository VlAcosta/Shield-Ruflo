import React, { useEffect, useMemo, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout';

const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M12 4L17 6V11C17 14.6 15.2 17.4 12 19C8.8 17.4 7 14.6 7 11V6L12 4Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M10 8L6 12L10 16H18C19.1 16 20 15.1 20 14V10C20 8.9 19.1 8 18 8H10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 10.5L15.5 13.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M15.5 10.5L12.5 13.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckRoundIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.8 12.2L10.9 14.3L15.5 9.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Dots({ value, length = 4, filledCount }) {
  const count = typeof filledCount === 'number' ? filledCount : value.length;

  return (
    <div className="pin-dots">
      {Array.from({ length }).map((_, index) => (
        <span
          key={index}
          className={index < count ? 'is-filled' : ''}
        />
      ))}
    </div>
  );
}

function Keypad({ onDigit, onDelete }) {
  return (
    <div className="pin-pad">
      {keypad.map((digit) => (
        <button key={digit} type="button" onClick={() => onDigit(digit)}>
          {digit}
        </button>
      ))}

      <div />

      <button type="button" onClick={() => onDigit('0')}>
        0
      </button>

      <button type="button" className="pin-pad__delete" onClick={onDelete}>
        <BackspaceIcon />
      </button>
    </div>
  );
}

function PinStep({ onSuccess, goSms }) {
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (pin.length !== 4) return;

    const timer = setTimeout(() => {
      if (pin === '1234') {
        onSuccess();
      } else {
        setShaking(true);
        setPin('');
        setTimeout(() => setShaking(false), 350);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [pin, onSuccess]);

  return (
    <div className={`pin-modal ${shaking ? 'is-shaking' : ''}`}>
      <div className="pin-modal__icon">
        <ShieldIcon />
      </div>

      <h2 className="pin-modal__title">Введите PIN</h2>
      <p className="pin-modal__subtitle">Бизнес Щит — управление репутацией</p>

      <Dots value={pin} />

      <Keypad
        onDigit={(digit) => {
          if (pin.length < 4) setPin((prev) => prev + digit);
        }}
        onDelete={() => setPin((prev) => prev.slice(0, -1))}
      />

      <div className="pin-links">
        <button type="button" onClick={goSms}>↻ Войти через SMS</button>
        <button type="button">ⓘ Помощь</button>
      </div>

      <div className="pin-hint">Подсказка: PIN — 1234</div>
    </div>
  );
}

function SmsStep({ onBack, onSuccess }) {
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (code.length !== 4) return;

    const timer = setTimeout(() => {
      if (code === '4321') {
        onSuccess();
      } else {
        setShaking(true);
        setCode('');
        setTimeout(() => setShaking(false), 350);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [code, onSuccess]);

  return (
    <div className={`pin-modal pin-modal--sms ${shaking ? 'is-shaking' : ''}`}>
      <button type="button" className="pin-modal__back" onClick={onBack}>
        ← Назад
      </button>

      <div className="pin-modal__icon">
        <ShieldIcon />
      </div>

      <h2 className="pin-modal__title">Код из SMS</h2>
      <p className="pin-modal__subtitle">
        Введите 4-значный код отправленный на ваш номер
      </p>

      <Dots value={code} />

      <div className="pin-modal__timer">
        Повторная отправка через <strong>00:{String(seconds).padStart(2, '0')}</strong>
      </div>

      <Keypad
        onDigit={(digit) => {
          if (code.length < 4) setCode((prev) => prev + digit);
        }}
        onDelete={() => setCode((prev) => prev.slice(0, -1))}
      />

      <div className="pin-hint">Подсказка: правильный код — 4321</div>
    </div>
  );
}

function NameStep({ onBack, onSuccess }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
  });

  const disabled = !form.firstName.trim() || !form.lastName.trim();

  return (
    <div className="pin-modal pin-modal--profile">
      <button type="button" className="pin-modal__back" onClick={onBack}>
        ← Назад
      </button>

      <div className="pin-modal__icon">
        <ShieldIcon />
      </div>

      <h2 className="pin-modal__title">Как вас зовут?</h2>
      <p className="pin-modal__subtitle">Заполните данные для входа</p>

      <div className="pin-modal__form">
        <input
          className="field field--modal"
          placeholder="Имя"
          value={form.firstName}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, firstName: e.target.value }))
          }
        />

        <input
          className="field field--modal"
          placeholder="Фамилия"
          value={form.lastName}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, lastName: e.target.value }))
          }
        />

        <button
          type="button"
          className="gradient-btn pin-modal__submit"
          disabled={disabled}
          onClick={() => onSuccess(form)}
        >
          Продолжить
        </button>
      </div>
    </div>
  );
}

function WelcomeStep() {
  return (
    <div className="welcome-modal welcome-modal--portal">
      <div className="welcome-modal__icon">
        <CheckRoundIcon />
      </div>
      <h3>Добро пожаловать!</h3>
    </div>
  );
}

export default function AuthGatePage() {
  const [step, setStep] = useState('pin');
  const [showWelcome, setShowWelcome] = useState(false);

  const pageContent = useMemo(() => {
    return (
      <div className="authgate-backdrop">
        <div className="authgate-backdrop__content">
          <div className="authgate-backdrop__grid">
            <div className="authgate-backdrop__panel authgate-backdrop__panel--chart">
              <div className="authgate-backdrop__title">Месяц</div>
              <div className="authgate-backdrop__big">+ 999</div>
              <div className="authgate-backdrop__green">↑ +2.46% рост отзывов</div>
              <div className="authgate-backdrop__graph" />
            </div>

            <div className="authgate-backdrop__panel authgate-backdrop__panel--bars">
              <div className="authgate-backdrop__title">Задачи</div>
              <div className="authgate-backdrop__bars">
                {[28, 56, 20, 72, 38, 50, 24, 86].map((h, i) => (
                  <span key={i} style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>

            <div className="authgate-backdrop__panel authgate-backdrop__panel--table" />
            <div className="authgate-backdrop__panel authgate-backdrop__panel--rating" />
            <div className="authgate-backdrop__panel authgate-backdrop__panel--calendar" />
          </div>
        </div>
      </div>
    );
  }, []);

  useEffect(() => {
    if (!showWelcome) return;

    const timer = setTimeout(() => {
      setShowWelcome(false);
      setStep('done');
    }, 1200);

    return () => clearTimeout(timer);
  }, [showWelcome]);

  return (
    <PortalLayout title="Главная страница" subtitle='ООО "ВНАЛ"' requirePin={false}>
      <div className="authgate-page">
        {pageContent}

        {(step !== 'done' || showWelcome) && (
          <div className="overlay overlay--soft">
            {step === 'pin' && (
              <PinStep
                onSuccess={() => setShowWelcome(true)}
                goSms={() => setStep('sms')}
              />
            )}

            {step === 'sms' && (
              <SmsStep
                onBack={() => setStep('pin')}
                onSuccess={() => setStep('name')}
              />
            )}

            {step === 'name' && (
              <NameStep
                onBack={() => setStep('sms')}
                onSuccess={() => setShowWelcome(true)}
              />
            )}

            {showWelcome && <WelcomeStep />}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}