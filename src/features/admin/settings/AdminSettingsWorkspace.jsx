import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAdminSettings from './hooks/useAdminSettings';
import { SETTINGS_TABS } from './model/adminSettingsData';
import './AdminSettingsWorkspace.scss';

function UnavailablePanel({ eyebrow, title, description }) {
  return (
    <section className="admin-settings-panel">
      <header>
        <div>
          <span>{eyebrow}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </header>
      <div className="admin-settings-test-result" role="status">
        Модуль не подключён к production backend. Business Shield не имитирует успешную настройку.
      </div>
    </section>
  );
}

function PlansTab({ plans, savePlan, saving }) {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    setDrafts(Object.fromEntries((plans || []).map((plan) => [plan.id, {
      name: plan.name || '',
      price: Number(plan.price || 0),
      active: plan.active !== false,
    }])));
  }, [plans]);

  const update = (id, key, value) => setDrafts((current) => ({
    ...current,
    [id]: { ...current[id], [key]: value },
  }));

  if (!plans?.length) {
    return <UnavailablePanel eyebrow="PLANS" title="Тарифы ещё не созданы" description="Создайте тариф в разделе подписок — после этого он появится здесь." />;
  }

  return (
    <div className="admin-settings-plans">
      {plans.map((plan, index) => {
        const draft = drafts[plan.id] || { name: plan.name || '', price: Number(plan.price || 0), active: plan.active !== false };
        return (
          <article key={plan.id} style={{ '--item-index': index }}>
            <header>
              <div><span>ТАРИФ</span><h3>{plan.name}</h3></div>
              <b>{plan.clients || 0} клиентов</b>
            </header>
            <div className="admin-settings-plans__grid">
              <label><span>Название</span><input value={draft.name} onChange={(event) => update(plan.id, 'name', event.target.value)} /></label>
              <label><span>Цена, ₽</span><input type="number" min="0" value={draft.price} onChange={(event) => update(plan.id, 'price', Number(event.target.value || 0))} /></label>
              <label>
                <span>Состояние</span>
                <select value={draft.active ? 'active' : 'disabled'} onChange={(event) => update(plan.id, 'active', event.target.value === 'active')}>
                  <option value="active">Активен</option>
                  <option value="disabled">Отключён</option>
                </select>
              </label>
            </div>
            <footer>
              <small>Данные сохраняются в PostgreSQL</small>
              <button type="button" disabled={saving} onClick={() => savePlan(plan.id, draft)}>{saving ? 'Сохраняем…' : 'Сохранить тариф'}</button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}


function NotificationsTab({ data, saveSection, testSmtp, saving, run }) {
  const initial = data.notifications || {};
  const [draft, setDraft] = useState({
    email: initial.email !== false,
    telegram: Boolean(initial.telegram),
    weeklyReports: initial.weeklyReports !== false,
    criticalAlerts: initial.criticalAlerts !== false,
  });

  useEffect(() => {
    const current = data.notifications || {};
    setDraft({
      email: current.email !== false,
      telegram: Boolean(current.telegram),
      weeklyReports: current.weeklyReports !== false,
      criticalAlerts: current.criticalAlerts !== false,
    });
  }, [data.notifications]);

  const smtp = data.smtp || {};
  const rows = [
    ['email', 'Email-уведомления', 'Глобальный переключатель platform email-уведомлений.'],
    ['telegram', 'Telegram-уведомления', 'Использовать Telegram для platform delivery после настройки bot token.'],
    ['weeklyReports', 'Еженедельные отчёты', 'Разрешить плановую delivery-отправку weekly reports.'],
    ['criticalAlerts', 'Критические оповещения', 'Разрешить срочные platform-уведомления и аварийные события.'],
  ];

  return (
    <div className="admin-settings-two">
      <section className="admin-settings-panel">
        <header><div><span>NOTIFICATIONS</span><h3>Каналы и правила доставки</h3><p>Настройки сохраняются в PostgreSQL и применяются как platform policy.</p></div></header>
        <div className="admin-settings-trigger-list">
          {rows.map(([key, title, description], index) => (
            <article key={key} style={{ '--item-index': index }}>
              <span><strong>{title}</strong><small>{description}</small></span>
              <button
                type="button"
                className={`admin-settings-switch ${draft[key] ? 'is-on' : ''}`}
                aria-pressed={draft[key]}
                disabled={saving}
                onClick={() => setDraft((current) => ({ ...current, [key]: !current[key] }))}
              ><i /></button>
            </article>
          ))}
        </div>
        <footer>
          <button type="button" disabled={saving} onClick={() => run(() => saveSection('notifications', draft), 'Настройки уведомлений сохранены')}>
            {saving ? 'Сохраняем…' : 'Сохранить настройки'}
          </button>
        </footer>
      </section>

      <section className="admin-settings-panel">
        <header><div><span>EMAIL DELIVERY</span><h3>Email provider</h3><p>Credentials остаются только в backend environment и никогда не передаются в браузер.</p></div></header>
        <div className="admin-settings-security__switches">
          <article><span><strong>Provider</strong><small>Текущий production provider.</small></span><b>{smtp.provider || 'disabled'}</b></article>
          <article><span><strong>Состояние</strong><small>Готовность к фактической отправке.</small></span><b>{smtp.configured ? 'Настроен' : 'Не настроен'}</b></article>
          <article><span><strong>From</strong><small>Серверный адрес отправителя.</small></span><b>{smtp.from || '—'}</b></article>
        </div>
        <footer>
          <button type="button" className="is-secondary" disabled={saving || !smtp.configured} onClick={() => run(() => testSmtp(), 'Тестовое письмо отправлено')}>
            Проверить отправку
          </button>
        </footer>
      </section>
    </div>
  );
}

function TemplatesTab({ data, saveTemplate, deleteTemplate, saving, run }) {
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const [selectedId, setSelectedId] = useState(templates[0]?.id || 'new');
  const selected = templates.find((item) => item.id === selectedId) || null;
  const [draft, setDraft] = useState({ name: '', body: '', tone: '', enabled: true });

  useEffect(() => {
    const current = templates.find((item) => item.id === selectedId);
    if (current) {
      setDraft({
        id: current.id,
        name: current.name || current.title || '',
        body: current.body || current.text || '',
        tone: current.tone || '',
        enabled: current.enabled !== false,
      });
    } else {
      setDraft({ name: '', body: '', tone: '', enabled: true });
    }
  }, [selectedId, templates]);

  const createNew = () => {
    setSelectedId('new');
    setDraft({ name: '', body: '', tone: '', enabled: true });
  };

  return (
    <div className="admin-settings-template-layout">
      <section className="admin-settings-template-list">
        <header><div><span>REPLY TEMPLATES</span><h3>Библиотека шаблонов</h3></div><button type="button" onClick={createNew}>+ Новый</button></header>
        <div>
          {templates.length ? templates.map((item, index) => (
            <button key={item.id} type="button" className={selectedId === item.id ? 'is-active' : ''} style={{ '--item-index': index }} onClick={() => setSelectedId(item.id)}>
              <i className={item.enabled === false ? 'is-danger' : 'is-success'} />
              <span><strong>{item.name || item.title || 'Без названия'}</strong><small>{item.tone || 'Без tone-of-voice'}</small></span>
              <b>›</b>
            </button>
          )) : <div className="admin-settings-test-result">Шаблонов пока нет. Создайте первый production-шаблон ответа.</div>}
        </div>
      </section>

      <section className="admin-settings-panel admin-settings-template-editor">
        <header><div><span>{selected ? 'EDIT TEMPLATE' : 'NEW TEMPLATE'}</span><h3>{selected ? 'Редактирование шаблона' : 'Новый шаблон ответа'}</h3><p>Шаблон хранится на backend и доступен всей platform-admin команде.</p></div></header>
        <div className="admin-settings-form">
          <label><span>Название</span><input value={draft.name} maxLength={180} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>Tone of voice</span><input value={draft.tone} maxLength={80} placeholder="Например: спокойный" onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value }))} /></label>
          <label className="is-wide"><span>Текст шаблона</span><textarea rows="12" value={draft.body} maxLength={20000} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label>
          <label>
            <span>Состояние</span>
            <select value={draft.enabled ? 'enabled' : 'disabled'} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.value === 'enabled' }))}>
              <option value="enabled">Активен</option>
              <option value="disabled">Отключён</option>
            </select>
          </label>
        </div>
        <footer>
          {selected ? <button type="button" className="is-danger" disabled={saving} onClick={() => run(async () => { await deleteTemplate(selected.id); createNew(); }, 'Шаблон удалён')}>Удалить</button> : null}
          <button
            type="button"
            disabled={saving || !draft.name.trim() || !draft.body.trim()}
            onClick={() => run(async () => {
              const result = await saveTemplate({ ...draft, ...(selected ? { id: selected.id } : {}) });
              const id = result?.template?.id || selected?.id;
              if (id) setSelectedId(id);
            }, selected ? 'Шаблон обновлён' : 'Шаблон создан')}
          >
            {saving ? 'Сохраняем…' : selected ? 'Сохранить шаблон' : 'Создать шаблон'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function IntegrationsTab({ data, toggleIntegration, saving, run }) {
  if (!data.capabilities?.platformIntegrations) {
    return <UnavailablePanel eyebrow="PLATFORM INTEGRATIONS" title="Платформенные интеграции не настроены" description="Provider adapters и их lifecycle появятся после отдельного production-подключения." />;
  }

  return (
    <div className="admin-settings-integrations">
      {(data.integrations || []).map((item, index) => (
        <article key={item.id} className={item.enabled ? 'is-connected' : `is-${item.status || 'disabled'}`} style={{ '--item-index': index }}>
          <div className="admin-settings-integrations__logo">{String(item.name || item.id || '?').slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="admin-settings-integrations__title"><strong>{item.name || item.id}</strong><span><i />{item.enabled ? 'enabled' : item.status || 'disabled'}</span></div>
            <small>{item.description || 'Platform integration configuration'}</small>
          </div>
          <button type="button" disabled={saving} onClick={() => run(() => toggleIntegration(item.id, !item.enabled), item.enabled ? 'Интеграция отключена' : 'Интеграция включена')}>
            {item.enabled ? 'Отключить' : 'Включить'}
          </button>
        </article>
      ))}
    </div>
  );
}

function SecurityTab({ data }) {
  const security = data.security || {};

  return (
    <div className="admin-settings-two admin-settings-security">
      <section className="admin-settings-panel">
        <header>
          <div>
            <span>SECURITY STATUS</span>
            <h3>Серверная защита Admin CRM</h3>
            <p>Статусы читаются из backend-конфигурации и не редактируются через браузер.</p>
          </div>
        </header>
        <div className="admin-settings-security__switches">
          <article><span><strong>Platform-admin allowlist</strong><small>Доступ выдаётся backend после HttpOnly-сессии.</small></span><b>{security.platformAdminAllowlistConfigured ? 'Настроен' : 'Не настроен'}</b></article>
          <article><span><strong>OTP provider</strong><small>Источник конфигурации — серверное окружение.</small></span><b>{security.otpProvider || 'Не определён'}</b></article>
          <article><span><strong>Swagger</strong><small>Публичная API-документация.</small></span><b>{security.swagger ? 'Включён' : 'Выключен'}</b></article>
        </div>
      </section>
      <section className="admin-settings-panel admin-settings-security-log">
        <header><div><span>AUDIT TRAIL</span><h3>Лог безопасности</h3><p>Отображаются только реальные серверные события.</p></div></header>
        {Array.isArray(data.securityLog) && data.securityLog.length ? (
          <div>{data.securityLog.map((event) => <article key={event.id}><span><strong>{event.title}</strong><small>{event.date || ''}</small></span></article>)}</div>
        ) : (
          <div className="admin-settings-test-result">Отдельный platform security-log пока не подключён.</div>
        )}
      </section>
    </div>
  );
}

function Skeleton() {
  return <div className="admin-settings-skeleton">{Array.from({ length: 7 }).map((_, index) => <i key={index} />)}</div>;
}

export default function AdminSettingsWorkspace({ onRefreshReady }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState(SETTINGS_TABS.some((item) => item.id === requestedTab) ? requestedTab : 'plans');
  const { data, error, refreshing, saving, refresh, savePlan, saveSection, toggleIntegration, saveTemplate, deleteTemplate, testSmtp } = useAdminSettings();
  const [toast, setToast] = useState('');

  useEffect(() => { onRefreshReady?.(refresh); }, [onRefreshReady, refresh]);
  useEffect(() => {
    if (requestedTab && SETTINGS_TABS.some((item) => item.id === requestedTab)) setTab(requestedTab);
  }, [requestedTab]);

  const changeTab = (id) => {
    setTab(id);
    setSearchParams({ tab: id }, { replace: true });
  };

  const run = async (action, message) => {
    try {
      await action();
      setToast(message);
      window.setTimeout(() => setToast(''), 2200);
    } catch {
      // The hook exposes the real server error; never display a fake success state.
    }
  };

  const capabilitySummary = useMemo(() => {
    if (!data) return { available: 0, total: 0 };
    const capabilities = { plans: true, ...(data.capabilities || {}) };
    const values = Object.values(capabilities);
    return { available: values.filter(Boolean).length, total: values.length };
  }, [data]);

  const sectionContent = useMemo(() => {
    if (!data) return null;
    if (tab === 'plans') return <PlansTab plans={data.plans || []} saving={saving} savePlan={(id, patch) => run(() => savePlan(id, patch), 'Тариф обновлён')} />;
    if (tab === 'notifications') return <NotificationsTab data={data} saveSection={saveSection} testSmtp={testSmtp} saving={saving} run={run} />;
    if (tab === 'integrations') return <IntegrationsTab data={data} toggleIntegration={toggleIntegration} saving={saving} run={run} />;
    if (tab === 'templates') return <TemplatesTab data={data} saveTemplate={saveTemplate} deleteTemplate={deleteTemplate} saving={saving} run={run} />;
    return <SecurityTab data={data} />;
  }, [data, tab, saving, savePlan, saveSection, toggleIntegration, saveTemplate, deleteTemplate, testSmtp]);

  if (!data && refreshing) return <Skeleton />;
  if (!data && error) return <section className="admin-settings-error"><strong>Не удалось загрузить настройки</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;
  if (!data) return null;

  return (
    <div className={`admin-settings ${refreshing ? 'is-refreshing' : ''}`}>
      <section className="admin-settings__intro">
        <div><span>SYSTEM CONFIGURATION</span><h2>Production-конфигурация платформы</h2><p>Рабочие возможности отделены от модулей, которым ещё нужны backend-модель или внешний provider.</p></div>
        <div className="admin-settings__health"><i /><span><strong>{capabilitySummary.available} / {capabilitySummary.total}</strong><small>production-возможностей доступны</small></span></div>
      </section>
      <section className="admin-settings__shell">
        <aside>{SETTINGS_TABS.map((item, index) => <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} style={{ '--tab-index': index }} onClick={() => changeTab(item.id)}><i>{String(index + 1).padStart(2, '0')}</i><span>{item.label}</span><b>›</b></button>)}</aside>
        <main>{sectionContent}</main>
      </section>
      {error ? <div className="admin-settings-toast is-error">{error}</div> : null}
      {toast ? <div className="admin-settings-toast">{toast}</div> : null}
    </div>
  );
}
