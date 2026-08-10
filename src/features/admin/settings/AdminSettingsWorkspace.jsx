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

function IntegrationsTab({ data }) {
  if (!data.capabilities?.platformIntegrations) {
    return <UnavailablePanel eyebrow="PLATFORM INTEGRATIONS" title="Платформенные интеграции не настроены" description="Provider adapters и их lifecycle появятся после отдельного production-подключения." />;
  }

  return (
    <div className="admin-settings-integrations">
      {(data.integrations || []).map((item, index) => (
        <article key={item.id} className={`is-${item.status}`} style={{ '--item-index': index }}>
          <div>
            <div className="admin-settings-integrations__title"><strong>{item.name}</strong><span>{item.status}</span></div>
            <small>{item.description}</small>
          </div>
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
  const { data, error, refreshing, saving, refresh, savePlan } = useAdminSettings();
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
    if (tab === 'notifications') return <UnavailablePanel eyebrow="NOTIFICATIONS" title="Platform notification settings не подключены" description="Операционные уведомления работают в tenant-контуре, но глобальная platform-настройка ещё не имеет persistence API." />;
    if (tab === 'integrations') return <IntegrationsTab data={data} />;
    if (tab === 'templates') return <UnavailablePanel eyebrow="REPLY TEMPLATES" title="Глобальная библиотека шаблонов не подключена" description="Backend намеренно возвращает not configured вместо localStorage или фиктивного успеха." />;
    return <SecurityTab data={data} />;
  }, [data, tab, saving, savePlan]);

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
