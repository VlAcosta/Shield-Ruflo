import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccessControl } from '../../access';
import {
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessOAuthStart,
  googleBusinessSelect,
  providerDiagnostics,
  providerDisconnect,
} from '../../../services/integrations/integrationProviderRegistry';
import './GoogleBusinessProfileSetup.scss';

const GOOGLE_PROVIDER_ID = 'google';

const STATUS_COPY = Object.freeze({
  CONNECTED: { label: 'Подключено', tone: 'success' },
  DEGRADED: { label: 'Нужен выбор профиля', tone: 'warning' },
  CONNECTING: { label: 'Ожидает Google', tone: 'info' },
  ERROR: { label: 'Требует внимания', tone: 'danger' },
  DISCONNECTED: { label: 'Не подключено', tone: 'neutral' },
});

function formatDate(value) {
  if (!value) return 'ещё не проверялось';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'нет данных';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function safeGoogleAuthorizationUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function LocationRow({ location, checked, onToggle }) {
  const title = location.title || location.storeCode || location.name;
  const subtitle = [
    location.storeCode ? `Код: ${location.storeCode}` : '',
    location.websiteUri || '',
  ].filter(Boolean).join(' · ');
  return (
    <label className={`google-business-location ${checked ? 'is-selected' : ''}`}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(location.name)} />
      <span className="google-business-location__check" aria-hidden="true">{checked ? '✓' : ''}</span>
      <span><strong>{title}</strong><small>{subtitle || location.name}</small></span>
    </label>
  );
}

export default function GoogleBusinessProfileSetup() {
  const access = useAccessControl();
  const canManage = access.can('integrations.manage');
  const [diagnostics, setDiagnostics] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const status = String(diagnostics?.status || 'DISCONNECTED').toUpperCase();
  const statusMeta = STATUS_COPY[status] || STATUS_COPY.DISCONNECTED;
  const availability = diagnostics?.availability || { configured: false, connectable: false };
  const isConfigured = Boolean(availability.configured && availability.connectable);

  const run = useCallback(async (action, callback) => {
    setBusy(action);
    setError('');
    try {
      return await callback();
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось выполнить действие Google Business Profile');
      throw requestError;
    } finally {
      setBusy('');
    }
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    try {
      const response = await providerDiagnostics(GOOGLE_PROVIDER_ID, { signal: undefined });
      setDiagnostics(response || null);
      return response;
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось проверить Google Business Profile');
      return null;
    }
  }, []);

  const loadAccounts = useCallback(async () => run('accounts', async () => {
    const response = await googleBusinessAccounts();
    const nextAccounts = Array.isArray(response?.accounts) ? response.accounts : [];
    setAccounts(nextAccounts);
    if (nextAccounts.length === 1) setSelectedAccount(nextAccounts[0].name || '');
    setSetupOpen(true);
    return nextAccounts;
  }), [run]);

  const loadLocations = useCallback(async (accountName) => {
    if (!accountName) {
      setLocations([]);
      setSelectedLocations([]);
      return [];
    }
    return run('locations', async () => {
      const response = await googleBusinessLocations(accountName);
      const nextLocations = Array.isArray(response?.locations) ? response.locations : [];
      setLocations(nextLocations);
      setSelectedLocations([]);
      return nextLocations;
    });
  }, [run]);

  useEffect(() => { void refreshDiagnostics(); }, [refreshDiagnostics]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get('google');
    const setup = params.get('setup');
    const code = params.get('code');
    if (!googleResult) return;

    if (googleResult === 'authorized') {
      setNotice('Google подтвердил авторизацию. Завершите выбор бизнес-профиля и локаций.');
      if (setup === 'account_selection_required') void loadAccounts();
      else void refreshDiagnostics();
    } else if (googleResult === 'cancelled') {
      setNotice('Подключение Google отменено. Доступ не был предоставлен.');
    } else if (googleResult === 'error') {
      setError(code ? `Google Business Profile: ${code}` : 'Не удалось завершить подключение Google Business Profile.');
    }

    ['google', 'setup', 'status', 'code'].forEach((key) => params.delete(key));
    const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash || ''}`;
    window.history.replaceState(window.history.state, '', clean);
  }, [loadAccounts, refreshDiagnostics]);

  useEffect(() => {
    if (selectedAccount) void loadLocations(selectedAccount);
  }, [loadLocations, selectedAccount]);

  const startOAuth = async () => {
    try {
      const response = await run('oauth', () => googleBusinessOAuthStart());
      const authorizationUrl = safeGoogleAuthorizationUrl(response?.authorizationUrl);
      if (!authorizationUrl) throw new Error('Сервер не вернул безопасный Google OAuth URL');
      window.location.assign(authorizationUrl);
    } catch { /* visible error is set by run */ }
  };

  const toggleLocation = (name) => {
    setSelectedLocations((current) => current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name]);
  };

  const saveSelection = async () => {
    if (!selectedAccount || !selectedLocations.length) {
      setError('Выберите Google Business account и хотя бы одну локацию.');
      return;
    }
    try {
      const response = await run('selection', () => googleBusinessSelect({
        googleAccountName: selectedAccount,
        locationNames: selectedLocations,
      }));
      const integration = response?.integration;
      setDiagnostics((current) => ({
        ...(current || {}),
        status: integration?.status || 'CONNECTED',
        connected: integration?.status === 'CONNECTED' || integration?.status === 'DEGRADED',
        lastValidatedAt: integration?.lastValidatedAt || new Date().toISOString(),
        lastErrorCode: integration?.lastErrorCode || null,
        lastErrorMessage: integration?.lastErrorMessage || null,
      }));
      setNotice(`Google Business Profile подключён. Выбрано локаций: ${selectedLocations.length}. Импорт отзывов будет доступен после этапа P17.`);
      setSetupOpen(false);
      setAccounts([]);
      setLocations([]);
      await refreshDiagnostics();
    } catch { /* visible error is set by run */ }
  };

  const disconnect = async () => {
    try {
      await run('disconnect', () => providerDisconnect(GOOGLE_PROVIDER_ID));
      setNotice('Google Business Profile отключён. Google подтвердил отзыв доступа.');
      setSetupOpen(false);
      setAccounts([]);
      setLocations([]);
      await refreshDiagnostics();
    } catch { /* visible error is set by run */ }
  };

  const primaryAction = useMemo(() => {
    if (!canManage) return null;
    if (!isConfigured) return { label: 'Требуется настройка сервера', disabled: true, action: null };
    if (status === 'CONNECTED') return { label: 'Изменить профиль и локации', disabled: false, action: loadAccounts };
    if (status === 'DEGRADED') return { label: 'Завершить настройку', disabled: false, action: loadAccounts };
    return { label: 'Подключить через Google', disabled: false, action: startOAuth };
  }, [canManage, isConfigured, loadAccounts, status]);

  return (
    <section className="google-business-setup" aria-labelledby="google-business-title">
      <div className="google-business-setup__brand" aria-hidden="true"><span>G</span></div>
      <div className="google-business-setup__content">
        <header>
          <div>
            <span className="google-business-setup__eyebrow">PRODUCTION PROVIDER · OAUTH 2.0</span>
            <h2 id="google-business-title">Google Business Profile</h2>
            <p>Подключение аккаунтов и локаций напрямую через Google. Токены остаются на backend и не передаются в браузер.</p>
          </div>
          <span className={`google-business-setup__status is-${statusMeta.tone}`}><i />{statusMeta.label}</span>
        </header>

        <div className="google-business-setup__facts">
          <div><span>Provider adapter</span><strong>{diagnostics?.adapterInstalled ? 'Установлен' : 'Не установлен'}</strong></div>
          <div><span>Серверная конфигурация</span><strong>{isConfigured ? 'Готова' : 'Не настроена'}</strong></div>
          <div><span>Последняя проверка</span><strong>{formatDate(diagnostics?.lastValidatedAt)}</strong></div>
          <div><span>Отзывы</span><strong className="is-pending">P17 · ещё не включены</strong></div>
        </div>

        {!isConfigured && diagnostics ? (
          <div className="google-business-setup__provider-warning" role="status">
            <strong>Google OAuth пока недоступен</strong>
            <span>{availability.reasonMessage || 'Нужно включить Google Business Profile и задать OAuth credentials на backend.'}</span>
          </div>
        ) : null}
        {diagnostics?.lastErrorMessage ? <div className="google-business-setup__error" role="alert"><strong>{diagnostics.lastErrorCode || 'Ошибка Google'}</strong><span>{diagnostics.lastErrorMessage}</span></div> : null}
        {notice ? <div className="google-business-setup__notice" role="status">{notice}</div> : null}
        {error ? <div className="google-business-setup__error" role="alert"><strong>Не удалось выполнить действие</strong><span>{error}</span></div> : null}

        {canManage ? (
          <div className="google-business-setup__actions">
            {primaryAction ? <button type="button" className="is-primary" disabled={primaryAction.disabled || Boolean(busy)} onClick={primaryAction.action || undefined}>{busy ? 'Проверяем…' : primaryAction.label}</button> : null}
            <button type="button" disabled={Boolean(busy)} onClick={() => void refreshDiagnostics()}>Обновить статус</button>
            {['CONNECTED', 'DEGRADED', 'ERROR'].includes(status) ? <button type="button" className="is-danger" disabled={Boolean(busy)} onClick={disconnect}>Отключить Google</button> : null}
          </div>
        ) : null}
      </div>

      {setupOpen ? (
        <div className="google-business-setup__wizard" role="region" aria-label="Выбор Google Business Profile">
          <div className="google-business-setup__wizard-head">
            <div><span>ШАГ 2 ИЗ 2</span><strong>Выберите профиль и локации</strong></div>
            <button type="button" onClick={() => setSetupOpen(false)} aria-label="Закрыть выбор Google Business Profile">×</button>
          </div>

          {busy === 'accounts' ? <div className="google-business-setup__loading" role="status">Загружаем доступные Google Business accounts…</div> : null}
          {!busy && !accounts.length ? <div className="google-business-setup__empty">Доступных Google Business accounts не найдено.</div> : null}
          {accounts.length ? (
            <label className="google-business-setup__select">
              <span>Google Business account</span>
              <select value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}>
                <option value="">Выберите аккаунт</option>
                {accounts.map((account) => <option key={account.name} value={account.name}>{account.accountName || account.name}</option>)}
              </select>
            </label>
          ) : null}

          {busy === 'locations' ? <div className="google-business-setup__loading" role="status">Получаем локации Google…</div> : null}
          {selectedAccount && !busy && !locations.length ? <div className="google-business-setup__empty">У выбранного аккаунта нет доступных локаций.</div> : null}
          {locations.length ? (
            <div className="google-business-setup__locations">
              <div className="google-business-setup__locations-head"><span>Локации</span><strong>{selectedLocations.length} из {locations.length}</strong></div>
              {locations.map((location) => <LocationRow key={location.name} location={location} checked={selectedLocations.includes(location.name)} onToggle={toggleLocation} />)}
            </div>
          ) : null}

          <div className="google-business-setup__wizard-actions">
            <button type="button" onClick={() => setSetupOpen(false)}>Позже</button>
            <button type="button" className="is-primary" disabled={!selectedAccount || !selectedLocations.length || Boolean(busy)} onClick={saveSelection}>{busy === 'selection' ? 'Проверяем доступ…' : 'Подтвердить локации'}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
