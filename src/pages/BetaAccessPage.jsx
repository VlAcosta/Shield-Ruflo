import React, { useState } from 'react';
import '../scss/pages/betaAccessPage.scss';

const BETA_PASSWORD = 'Shit2026-05';
const BETA_ACCESS_KEY = 'shit_beta_access_granted';

export function hasBetaAccess() {
  return localStorage.getItem(BETA_ACCESS_KEY) === 'true';
}

export function grantBetaAccess() {
  localStorage.setItem(BETA_ACCESS_KEY, 'true');
}

export function revokeBetaAccess() {
  localStorage.removeItem(BETA_ACCESS_KEY);
}

function BetaAccessPage({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (password.trim() === BETA_PASSWORD) {
      grantBetaAccess();
      setError('');
      onSuccess?.();
      return;
    }

    setError('Неверный пароль. Проверь ввод и попробуй ещё раз.');
  };

  return (
    <main className="beta-access-page">
      <section className="beta-access-card">
        <div className="beta-access-badge">Beta access</div>

        <h1>Закрытый доступ</h1>

        <p>
          Сайт находится в beta-режиме. Введи пароль, чтобы открыть доступ к платформе.
        </p>

        <form className="beta-access-form" onSubmit={handleSubmit}>
          <label htmlFor="beta-password">Пароль доступа</label>

          <div className="beta-access-input-wrap">
            <input
              id="beta-password"
              type={isVisible ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError('');
              }}
              placeholder="Введите пароль"
              autoComplete="off"
              autoFocus
            />

            <button
              type="button"
              className="beta-access-eye"
              onClick={() => setIsVisible((value) => !value)}
            >
              {isVisible ? 'Скрыть' : 'Показать'}
            </button>
          </div>

          {error && <div className="beta-access-error">{error}</div>}

          <button className="beta-access-submit" type="submit">
            Войти на сайт
          </button>
        </form>
      </section>
    </main>
  );
}

export default BetaAccessPage;