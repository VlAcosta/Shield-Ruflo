import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import GoogleBusinessProfileSetup from '../../integrations/GoogleBusinessProfile/GoogleBusinessProfileSetup';
import IntegrationHubWorkspace from '../../integrations/IntegrationHub';
import AutomationsWorkspace from '../../automations/AutomationsWorkspace';
import { getPermissionAccessState } from '../../../services/access/planAccessService';
import './SystemProfile.scss';

export default function SystemProfile({ access }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const automationState = getPermissionAccessState('automations.view', access);
  const integrationState = access.can('integrations.view') ? 'allowed' : 'role_denied';

  const sections = useMemo(() => [
    integrationState !== 'role_denied'
      ? { id: 'integrations', label: 'Интеграции', state: integrationState }
      : null,
    automationState !== 'role_denied'
      ? { id: 'automations', label: 'Автоматизации', state: automationState }
      : null,
  ].filter(Boolean), [automationState, integrationState]);

  const requested = searchParams.get('section');
  const activeSection = sections.some((item) => item.id === requested)
    ? requested
    : sections[0]?.id || null;

  const selectSection = (section) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'system');
    next.set('section', section);
    setSearchParams(next, { replace: true });
  };

  const openAutomationUpgrade = () => {
    const next = new URLSearchParams({
      upgrade: 'automations.view',
      from: '/profile?tab=system&section=automations',
    });
    navigate(`/subscriptions?${next.toString()}`);
  };

  if (!sections.length) {
    return (
      <section className="system-profile system-profile--empty">
        <span>Системные настройки</span>
        <h2>Нет доступных разделов</h2>
        <p>Доступ к интеграциям и автоматизациям ограничен вашей ролью.</p>
      </section>
    );
  }

  return (
    <section className="system-profile">
      <header className="system-profile__head">
        <div>
          <span>Системные настройки</span>
          <h2>Подключения и автоматизация</h2>
          <p>Управляйте источниками данных и правилами обработки из одного раздела настроек организации.</p>
        </div>
        <nav className="system-profile__switch" aria-label="Системные настройки">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeSection === item.id ? 'is-active' : ''}
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => selectSection(item.id)}
            >
              <span>{item.label}</span>
              {item.state === 'plan_locked' ? <small>PRO</small> : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="system-profile__body" key={activeSection}>
        {activeSection === 'integrations' ? (
          <div className="system-profile__stack">
            <GoogleBusinessProfileSetup />
            <IntegrationHubWorkspace />
          </div>
        ) : null}

        {activeSection === 'automations' && automationState === 'allowed' ? (
          <AutomationsWorkspace />
        ) : null}

        {activeSection === 'automations' && automationState === 'plan_locked' ? (
          <div className="system-profile__upgrade">
            <span className="system-profile__upgrade-mark">PRO</span>
            <div>
              <small>Автоматизации</small>
              <h3>Правила и сценарии доступны в PRO</h3>
              <p>Ваша роль разрешает работу с автоматизациями, но текущий тариф организации не включает этот модуль.</p>
            </div>
            {access.can('billing.view') ? (
              <button type="button" onClick={openAutomationUpgrade}>Посмотреть тарифы</button>
            ) : (
              <p className="system-profile__upgrade-note">Обратитесь к владельцу организации для изменения тарифа.</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
