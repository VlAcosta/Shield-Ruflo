import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { agencyService } from '../../services/agency/agencyService';
import useAccessControl from '../access/hooks/useAccessControl';
import './AgencyPortfolioWorkspace.scss';

const DELEGATED_SCOPE_OPTIONS = Object.freeze([
  ['dashboard.view', 'Главная'],
  ['reviews.view', 'Отзывы'],
  ['reviews.reply', 'Ответы на отзывы'],
  ['reviews.moderate', 'Модерация отзывов'],
  ['reviews.intelligence.read', 'AI-анализ отзывов'],
  ['cases.view', 'Кейсы'],
  ['cases.manage', 'Работа с кейсами'],
  ['competitive.view', 'Конкуренты'],
  ['ai_visibility.view', 'AI Visibility'],
  ['tasks.view', 'Задачи'],
  ['reports.view', 'Отчёты'],
  ['analytics.view', 'Аналитика'],
]);

const DEFAULT_SCOPES = ['dashboard.view', 'reviews.view', 'reviews.reply', 'cases.view', 'analytics.view'];

function Score({ value, suffix = '' }) {
  if (value === null || value === undefined) return <span className="agency-portfolio__muted">—</span>;
  return <strong>{value}{suffix}</strong>;
}

function HealthBadge({ score }) {
  if (score === null || score === undefined) return <span className="agency-portfolio__badge is-neutral">Нет источников</span>;
  const tone = score >= 90 ? 'is-good' : score >= 70 ? 'is-warn' : 'is-danger';
  return <span className={`agency-portfolio__badge ${tone}`}>{score}%</span>;
}

function ClientRow({ item, busyLinkId, onStatus }) {
  const link = item.link;
  const paused = link.status === 'PAUSED';
  return (
    <tr>
      <td>
        <div className="agency-portfolio__client">
          <span>{String(item.client?.name || 'К').slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{item.client?.name || 'Клиент'}</strong>
            <small>{item.client?.slug || link.clientOrganizationId}</small>
          </div>
        </div>
      </td>
      <td><Score value={item.reputationScore} suffix="/100" /></td>
      <td><strong className={item.criticalCases > 0 ? 'agency-portfolio__dangerText' : ''}>{item.criticalCases}</strong></td>
      <td><Score value={item.reviewVolume} /></td>
      <td>
        <span className={`agency-portfolio__badge ${item.sla?.status === 'ON_TRACK' ? 'is-good' : 'is-warn'}`}>
          {item.sla?.status === 'ON_TRACK' ? 'В норме' : `${item.sla?.overdueTasks || 0} просрочено`}
        </span>
      </td>
      <td><HealthBadge score={item.providerHealth?.score} /></td>
      <td>
        <div className="agency-portfolio__actions">
          <button
            type="button"
            onClick={() => onStatus(link.id, paused ? 'ACTIVE' : 'PAUSED')}
            disabled={busyLinkId === link.id}
          >
            {paused ? 'Возобновить' : 'Пауза'}
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => onStatus(link.id, 'REVOKED')}
            disabled={busyLinkId === link.id}
          >
            Отозвать
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AgencyPortfolioWorkspace() {
  const access = useAccessControl();
  const canView = access.can('agency.view');
  const canManage = access.can('agency.manage') && access.accessMode !== 'DELEGATED';
  const [portfolio, setPortfolio] = useState(null);
  const [state, setState] = useState(canView ? 'loading' : 'denied');
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [clientOrganizationId, setClientOrganizationId] = useState('');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [scopes, setScopes] = useState(DEFAULT_SCOPES);
  const [creating, setCreating] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [busyLinkId, setBusyLinkId] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (signal) => {
    if (!canView) return;
    setState('loading');
    setError('');
    try {
      const result = await agencyService.getPortfolio({ signal });
      setPortfolio(result);
      setState('ready');
    } catch (requestError) {
      if (requestError?.name === 'AbortError') return;
      setError(requestError?.message || 'Не удалось загрузить портфель агентства');
      setState('error');
    }
  }, [canView]);

  useEffect(() => {
    if (!canView) {
      setState('denied');
      return undefined;
    }
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [canView, load]);

  const summary = useMemo(() => {
    const clients = portfolio?.clients || [];
    const scored = clients.filter((item) => Number.isFinite(item.reputationScore));
    const average = scored.length
      ? Math.round(scored.reduce((sum, item) => sum + item.reputationScore, 0) / scored.length)
      : null;
    return {
      clients: clients.length,
      reputation: average,
      critical: clients.reduce((sum, item) => sum + (item.criticalCases || 0), 0),
      reviews: clients.reduce((sum, item) => sum + (item.reviewVolume || 0), 0),
    };
  }, [portfolio]);

  const toggleScope = (permission) => {
    setScopes((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  };

  const createInvite = async (event) => {
    event.preventDefault();
    if (!clientOrganizationId.trim() || !scopes.length || creating) return;
    setCreating(true);
    setError('');
    setInvitation(null);
    try {
      const result = await agencyService.createInvitation({
        clientOrganizationId: clientOrganizationId.trim(),
        permissions: scopes,
        grantExpiresAt: grantExpiresAt ? new Date(grantExpiresAt).toISOString() : null,
      });
      const acceptUrl = `${window.location.origin}/agency/invite/${encodeURIComponent(result.token)}`;
      setInvitation({ ...result, acceptUrl });
      setCopied(false);
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось создать приглашение');
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = async () => {
    if (!invitation?.acceptUrl) return;
    try {
      await navigator.clipboard.writeText(invitation.acceptUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const updateStatus = async (linkId, status) => {
    if (!canManage || busyLinkId) return;
    const destructive = status === 'REVOKED';
    if (destructive && !window.confirm('Отозвать агентский доступ к клиенту? Все делегированные grants будут закрыты.')) return;
    setBusyLinkId(linkId);
    setError('');
    try {
      await agencyService.updateClientLink(linkId, status);
      await load();
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось изменить доступ клиента');
    } finally {
      setBusyLinkId('');
    }
  };

  if (state === 'denied') {
    return (
      <section className="agency-portfolio agency-portfolio--center">
        <strong>Нет доступа к портфелю агентства</strong>
        <p>Серверная роль не содержит разрешение <code>agency.view</code>.</p>
      </section>
    );
  }

  if (state === 'loading' && !portfolio) {
    return <section className="agency-portfolio agency-portfolio--center"><span className="agency-portfolio__loader" />Загружаем портфель…</section>;
  }

  return (
    <section className="agency-portfolio">
      <header className="agency-portfolio__hero">
        <div>
          <span className="agency-portfolio__eyebrow">Enterprise & Agency</span>
          <h2>{portfolio?.agency?.name || 'Портфель агентства'}</h2>
          <p>Консолидированное состояние клиентских организаций с изолированным делегированным доступом.</p>
        </div>
        {canManage ? (
          <button type="button" className="agency-portfolio__primary" onClick={() => setShowInvite((value) => !value)}>
            {showInvite ? 'Закрыть' : 'Подключить клиента'}
          </button>
        ) : null}
      </header>

      {error ? <div className="agency-portfolio__alert" role="alert">{error}</div> : null}

      <div className="agency-portfolio__kpis">
        <article><small>Клиенты</small><strong>{summary.clients}</strong><span>активных связей</span></article>
        <article><small>Reputation Score</small><strong>{summary.reputation ?? '—'}</strong><span>среднее по портфелю</span></article>
        <article><small>Критические кейсы</small><strong>{summary.critical}</strong><span>требуют внимания</span></article>
        <article><small>Отзывы · 30 дней</small><strong>{summary.reviews}</strong><span>по всем клиентам</span></article>
      </div>

      {showInvite && canManage ? (
        <div className="agency-portfolio__invitePanel">
          <div className="agency-portfolio__inviteIntro">
            <span>Новый клиент</span>
            <h3>Запросить делегированный доступ</h3>
            <p>Связь не активируется автоматически. Владелец клиентского пространства должен открыть персональную ссылку и подтвердить scopes.</p>
          </div>
          <form onSubmit={createInvite} className="agency-portfolio__inviteForm">
            <label>
              <span>ID организации клиента</span>
              <input
                value={clientOrganizationId}
                onChange={(event) => setClientOrganizationId(event.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                required
              />
            </label>
            <label>
              <span>Доступ до</span>
              <input type="datetime-local" value={grantExpiresAt} onChange={(event) => setGrantExpiresAt(event.target.value)} />
            </label>
            <fieldset>
              <legend>Разрешения</legend>
              <div className="agency-portfolio__scopeGrid">
                {DELEGATED_SCOPE_OPTIONS.map(([permission, label]) => (
                  <label key={permission} className={scopes.includes(permission) ? 'is-selected' : ''}>
                    <input type="checkbox" checked={scopes.includes(permission)} onChange={() => toggleScope(permission)} />
                    <span><strong>{label}</strong><small>{permission}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="agency-portfolio__primary" disabled={creating || !scopes.length}>
              {creating ? 'Создаём…' : 'Создать защищённую ссылку'}
            </button>
          </form>

          {invitation ? (
            <div className="agency-portfolio__inviteResult">
              <div><strong>Приглашение создано</strong><span>Токен хранится на сервере только в виде SHA-256 hash и используется один раз.</span></div>
              <code>{invitation.acceptUrl}</code>
              <button type="button" onClick={copyInvite}>{copied ? 'Скопировано' : 'Копировать ссылку'}</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="agency-portfolio__tableCard">
        <div className="agency-portfolio__tableHead">
          <div><strong>Клиентский портфель</strong><span>Период KPI: последние 30 дней</span></div>
          <button type="button" onClick={() => load()} disabled={state === 'loading'}>Обновить</button>
        </div>
        {(portfolio?.clients || []).length ? (
          <div className="agency-portfolio__tableScroll">
            <table>
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Reputation Score</th>
                  <th>Critical Cases</th>
                  <th>Review Volume</th>
                  <th>SLA</th>
                  <th>Provider Health</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {portfolio.clients.map((item) => (
                  <ClientRow key={item.link.id} item={item} busyLinkId={busyLinkId} onStatus={updateStatus} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="agency-portfolio__empty">
            <strong>Клиентов пока нет</strong>
            <p>Создайте приглашение. Клиент появится здесь только после явного подтверждения доступа.</p>
          </div>
        )}
      </div>
    </section>
  );
}
