import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useOrganization from '../../../hooks/useOrganization';
import useDashboardFirstRun from '../hooks/useDashboardFirstRun';
import './FirstRunExperience.scss';

function Icon({ name, size = 20 }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (name === 'shield') return <svg {...props}><path d="M12 3 19 6v5c0 4.6-2.9 8.3-7 10-4.1-1.7-7-5.4-7-10V6l7-3Z"/><path d="m8.7 12 2.1 2.1 4.5-4.5"/></svg>;
  if (name === 'check') return <svg {...props}><path d="m5 12.5 4 4L19 7.5"/></svg>;
  if (name === 'building') return <svg {...props}><path d="M4 21V6l8-3 8 3v15"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01M10 21v-4h4v4"/></svg>;
  if (name === 'layers') return <svg {...props}><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/></svg>;
  if (name === 'lock') return <svg {...props}><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>;
  if (name === 'link') return <svg {...props}><path d="M9.5 14.5 14.5 9.5"/><path d="m7.2 16.8-1.7 1.7a3.5 3.5 0 1 1-5-5l3.2-3.2a3.5 3.5 0 0 1 4.9 0" transform="translate(3 0)"/><path d="m16.8 7.2 1.7-1.7a3.5 3.5 0 1 1 5 5l-3.2 3.2a3.5 3.5 0 0 1-4.9 0" transform="translate(-3 0)"/></svg>;
  if (name === 'grid') return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>;
  if (name === 'arrow') return <svg {...props}><path d="M5 12h14M14 7l5 5-5 5"/></svg>;
  if (name === 'spark') return <svg {...props}><path d="m12 3 1.3 3.8L17 8l-3.7 1.2L12 13l-1.3-3.8L7 8l3.7-1.2L12 3Z"/><path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z"/></svg>;
  if (name === 'task') return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 2.2 2.2L16 8.5"/></svg>;
  if (name === 'user') return <svg {...props}><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>;
  if (name === 'message') return <svg {...props}><path d="M5 18.5 3.5 21l3.8-1.1A8.8 8.8 0 1 0 5 18.5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>;
  if (name === 'close') return <svg {...props}><path d="m7 7 10 10M17 7 7 17"/></svg>;
  return null;
}

function Milestone({ done, icon, title, text, index }) {
  return (
    <div className={`first-run-milestone ${done ? 'is-done' : ''}`} style={{ '--milestone-index': index }}>
      <span className="first-run-milestone__icon">
        {done ? <Icon name="check" size={16} /> : <Icon name={icon} size={17} />}
      </span>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      <i className="first-run-milestone__rail" aria-hidden="true" />
    </div>
  );
}

function SourceConnector({ integrations, onSave, ready }) {
  const pending = useMemo(() => integrations.filter((item) => !item.link), [integrations]);
  const initialIntegration = pending[0] || integrations[0] || null;
  const initialId = initialIntegration?.id || '';
  const [integrationId, setIntegrationId] = useState(initialId);
  const [link, setLink] = useState(initialIntegration?.link || '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const selected = integrations.find((item) => item.id === integrationId) || integrations[0];

  const submit = (event) => {
    event.preventDefault();
    setError('');
    setSaved(false);
    try {
      onSave(integrationId, link);
      setSaved(true);
      setLink('');
    } catch (submitError) {
      setError(submitError.message || 'Не удалось сохранить ссылку');
    }
  };

  if (!integrations.length) {
    return (
      <div className="first-run-source first-run-source--empty">
        <span className="first-run-source__icon"><Icon name="layers" size={21} /></span>
        <div>
          <strong>Площадки пока не подключены</strong>
          <p>Это не мешает работе кабинета. Добавить источники можно позже из настроек интеграций.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`first-run-source ${ready ? 'is-ready' : ''}`}>
      <div className="first-run-source__head">
        <div>
          <span>Источник данных</span>
          <strong>{ready ? 'Первый источник активирован' : 'Добавьте ссылку на площадку'}</strong>
        </div>
        <span className="first-run-source__state"><i />{ready ? 'готово' : '1 действие'}</span>
      </div>

      <div className="first-run-source__platforms">
        {integrations.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`${integrationId === item.id ? 'is-active' : ''} ${item.link ? 'is-linked' : ''}`}
            onClick={() => {
              setIntegrationId(item.id);
              setLink(item.link || '');
              setSaved(false);
              setError('');
            }}
          >
            <span className={`is-${item.tone || 'violet'}`}>{String(item.shortName || item.name).slice(0, 2).toUpperCase()}</span>
            <strong>{item.shortName || item.name}</strong>
            {item.link ? <i><Icon name="check" size={11} /></i> : null}
          </button>
        ))}
      </div>

      <form className="first-run-source__form" onSubmit={submit}>
        <label>
          <span>{selected?.name || 'Площадка'}</span>
          <div>
            <Icon name="link" size={16} />
            <input
              type="url"
              value={link}
              onChange={(event) => {
                setLink(event.target.value);
                setSaved(false);
                setError('');
              }}
              placeholder="https://..."
              aria-label={`Ссылка на ${selected?.name || 'площадку'}`}
            />
          </div>
        </label>
        <button type="submit" disabled={!integrationId || !link.trim()}>
          {saved ? 'Сохранено' : 'Сохранить'} <Icon name={saved ? 'check' : 'arrow'} size={15} />
        </button>
      </form>
      {error ? <p className="first-run-source__message is-error">{error}</p> : null}
      {saved ? <p className="first-run-source__message is-success">Площадка готова к сбору данных.</p> : null}
    </div>
  );
}

function Radar({ integrations, sourceReady }) {
  const dots = integrations.slice(0, 5);
  const positions = [
    ['84px', '0px'],
    ['26px', '80px'],
    ['-68px', '50px'],
    ['-68px', '-50px'],
    ['26px', '-80px'],
  ];
  return (
    <div className="first-run-radar" aria-hidden="true">
      <div className="first-run-radar__grid" />
      <div className="first-run-radar__ring is-one" />
      <div className="first-run-radar__ring is-two" />
      <div className="first-run-radar__ring is-three" />
      <div className="first-run-radar__sweep" />
      <div className="first-run-radar__core"><Icon name="shield" size={24} /></div>
      {dots.map((item, index) => (
        <span
          key={item.id}
          className={`first-run-radar__dot is-${item.tone || 'violet'} ${item.link ? 'is-live' : ''}`}
          style={{ '--dot-index': index, '--dot-x': positions[index][0], '--dot-y': positions[index][1] }}
          title={item.name}
        />
      ))}
      <span className={`first-run-radar__label ${sourceReady ? 'is-live' : ''}`}>
        {sourceReady ? 'MONITORING LIVE' : 'READY TO SCAN'}
      </span>
    </div>
  );
}

function FirstRunExperience({ onWorkspaceOpen }) {
  const navigate = useNavigate();
  const organization = useOrganization();
  const nextActionsRef = useRef(null);
  const {
    active,
    integrations,
    sourceReady,
    workspaceReady,
    completedCount,
    totalCount,
    progress,
    complete,
    milestones,
    configuration,
    security,
    markWorkspaceOpened,
    dismiss,
    saveSourceLink,
  } = useDashboardFirstRun();

  useEffect(() => {
    if (!active || !complete) return undefined;
    const timer = window.setTimeout(() => dismiss(), 4600);
    return () => window.clearTimeout(timer);
  }, [active, complete, dismiss]);

  if (!active) return null;

  const title = organization.title || configuration?.organization?.title || 'ваша организация';
  const linkedCount = integrations.filter((item) => item.link).length;

  const openWorkspace = () => {
    markWorkspaceOpened();
    window.setTimeout(() => onWorkspaceOpen?.(), 60);
  };

  return (
    <section className={`first-run ${complete ? 'is-complete' : ''}`} aria-label="Первый запуск Бизнес Щит">
      <article className="first-run-hero">
        <div className="first-run-hero__aurora" aria-hidden="true"><i /><i /><i /></div>
        <div className="first-run-hero__grid" aria-hidden="true" />

        <button className="first-run-hero__dismiss" type="button" onClick={dismiss} title="Скрыть приветствие">
          <Icon name="close" size={16} />
          <span>Скрыть</span>
        </button>

        <div className="first-run-hero__copy">
          <span className="first-run-hero__eyebrow"><Icon name="spark" size={15} /> Первый запуск</span>
          <h1>{complete ? 'Всё готово к работе' : 'Щит настроен. Теперь запускаем данные.'}</h1>
          <p>
            {complete
              ? `${title} полностью готова к работе в Бизнес Щит. Можно переходить к основной доске.`
              : `${title} уже защищена базовыми настройками. Осталось два коротких действия, чтобы рабочая доска начала наполняться данными.`}
          </p>

          <div className="first-run-hero__chips" aria-label="Статус первого запуска">
            <span><i><Icon name="check" size={12} /></i> Компания подтверждена</span>
            <span><i><Icon name="layers" size={12} /></i> {integrations.length} {integrations.length === 1 ? 'площадка' : 'площадки'}</span>
            <span><i><Icon name="lock" size={12} /></i> PIN · {security.sessionMinutes} мин</span>
          </div>

          <div className="first-run-hero__actions">
            {complete ? (
              <>
                <button type="button" className="first-run-button is-primary" onClick={dismiss}>
                  Перейти к рабочей доске <Icon name="arrow" size={17} />
                </button>
                <span className="first-run-hero__auto-dismiss">Окно закроется автоматически через несколько секунд</span>
              </>
            ) : (
              <button
                type="button"
                className="first-run-button is-primary"
                onClick={() => nextActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                Продолжить запуск <Icon name="arrow" size={17} />
              </button>
            )}
            {!workspaceReady ? (
              <button type="button" className="first-run-button is-secondary" onClick={openWorkspace}>
                <Icon name="grid" size={17} /> Открыть стартовую доску
              </button>
            ) : null}
          </div>
        </div>

        <div className="first-run-hero__instrument">
          <div className="first-run-progress" style={{ '--first-run-progress': `${progress * 3.6}deg` }}>
            <div className="first-run-progress__orbit is-one"><i /></div>
            <div className="first-run-progress__orbit is-two"><i /></div>
            <div className="first-run-progress__face">
              <span><Icon name="shield" size={28} /></span>
              <strong>{completedCount}/{totalCount}</strong>
              <small>{complete ? 'готово' : 'настроено'}</small>
            </div>
          </div>
          <div className="first-run-hero__instrument-copy">
            <span>Готовность рабочего пространства</span>
            <strong>{progress}%</strong>
          </div>
        </div>
      </article>

      <div className="first-run__launch-grid" ref={nextActionsRef}>
        <article className="first-run-card first-run-card--checklist">
          <header className="first-run-card__head">
            <div>
              <span>Launch checklist</span>
              <h2>Пять шагов до полностью живой доски</h2>
            </div>
            <strong>{completedCount}/{totalCount}</strong>
          </header>

          <div className="first-run-milestones">
            <Milestone index={0} done={milestones.companyReady} icon="building" title="Организация" text="Реквизиты подтверждены и добавлены в профиль" />
            <Milestone index={1} done={milestones.integrationsReady} icon="layers" title="Интеграции" text={`${integrations.length || 0} источника подключено к кабинету`} />
            <Milestone index={2} done={milestones.securityReady} icon="lock" title="Безопасность" text={`PIN создан · автоблокировка ${security.autoLock ? 'включена' : 'отключена'}`} />
            <Milestone index={3} done={milestones.sourceReady} icon="link" title="Первый источник" text={sourceReady ? `${linkedCount} площадка готова к мониторингу` : 'Добавьте ссылку хотя бы к одной площадке'} />
            <Milestone index={4} done={milestones.workspaceReady} icon="grid" title="Рабочая доска" text={workspaceReady ? 'Стартовая доска уже открыта' : 'Посмотрите, где будут появляться основные показатели'} />
          </div>

          {!workspaceReady ? (
            <button type="button" className="first-run-card__workspace-link" onClick={openWorkspace}>
              Посмотреть стартовую доску <Icon name="arrow" size={15} />
            </button>
          ) : null}
        </article>

        <article className="first-run-card first-run-card--monitor">
          <div className="first-run-card__monitor-copy">
            <span className="first-run-card__live"><i /> {sourceReady ? 'Сбор данных запущен' : 'Мониторинг готов'}</span>
            <h2>{sourceReady ? 'Щит уже сканирует подключённые площадки' : 'Один адрес — и начнём собирать первые сигналы'}</h2>
            <p>
              {sourceReady
                ? 'Первые отзывы, изменения рейтинга и сигналы появятся в блоках автоматически после получения данных.'
                : 'Мы уже сохранили ваши площадки. Добавьте ссылку на карточку компании, чтобы начать мониторинг.'}
            </p>
            <div className="first-run-card__monitor-status">
              <span><i className="is-done" /> Профиль компании <b>готов</b></span>
              <span><i className={integrations.length ? 'is-done' : ''} /> Площадки <b>{integrations.length || 0}</b></span>
              <span><i className={sourceReady ? 'is-live' : ''} /> Отзывы <b>{sourceReady ? 'ожидаем данные' : 'не запущено'}</b></span>
            </div>
          </div>
          <Radar integrations={integrations} sourceReady={sourceReady} />
        </article>
      </div>

      <div className="first-run__action-grid">
        <SourceConnector integrations={integrations} onSave={saveSourceLink} ready={sourceReady} />

        <article className="first-run-actions">
          <header>
            <span>Рекомендуем дальше</span>
            <strong>Три быстрых действия</strong>
          </header>
          <div className="first-run-actions__list">
            <button type="button" onClick={() => navigate('/tasks')}>
              <span className="is-violet"><Icon name="task" size={18} /></span>
              <div><strong>Создать первую задачу</strong><small>Поставьте команде первый рабочий шаг</small></div>
              <Icon name="arrow" size={16} />
            </button>
            <button type="button" onClick={() => navigate('/profile?tab=company')}>
              <span className="is-blue"><Icon name="user" size={18} /></span>
              <div><strong>Проверить профиль компании</strong><small>Контакты, реквизиты и данные организации</small></div>
              <Icon name="arrow" size={16} />
            </button>
            <button type="button" onClick={() => navigate('/chat?channel=manager')}>
              <span className="is-cyan"><Icon name="message" size={18} /></span>
              <div><strong>Познакомиться с поддержкой</strong><small>Менеджер поможет настроить первый сценарий</small></div>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

export default memo(FirstRunExperience);
