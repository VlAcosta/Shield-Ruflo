import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  INTEGRATION_ITEMS,
  ONBOARDING_STEPS,
} from '../model/onboardingData';
import {
  applyOnboardingConfiguration,
  clearOnboardingDraft,
  lookupOrganizationByInn,
  readOnboardingDraft,
  saveOnboardingDraft,
} from '../../../services/onboarding/onboardingService';
import './OnboardingWorkspace.scss';

const onlyDigits = (value, limit) => String(value || '').replace(/\D/g, '').slice(0, limit);

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

  if (name === 'building') return <svg {...props}><path d="M4 21V5.8L12 3l8 2.8V21"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M16 16h.01M10 21v-5h4v5"/></svg>;
  if (name === 'search') return <svg {...props}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>;
  if (name === 'check') return <svg {...props}><path d="m5 12.5 4.2 4.2L19 7"/></svg>;
  if (name === 'lock') return <svg {...props}><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>;
  if (name === 'link') return <svg {...props}><path d="M10 13.5 13.5 10"/><path d="M7.2 15.8 5.5 17.5a3.5 3.5 0 0 1-5-5l3.1-3.1a3.5 3.5 0 0 1 4.9 0" transform="translate(3 0)"/><path d="m16.8 8.2 1.7-1.7a3.5 3.5 0 0 1 5 5l-3.1 3.1a3.5 3.5 0 0 1-4.9 0" transform="translate(-3 0)"/></svg>;
  if (name === 'shield') return <svg {...props}><path d="M12 3 19 6v5c0 4.6-2.9 8.3-7 10-4.1-1.7-7-5.4-7-10V6l7-3Z"/><path d="m8.7 12 2.1 2.1 4.5-4.5"/></svg>;
  if (name === 'arrow') return <svg {...props}><path d="M5 12h14M14 7l5 5-5 5"/></svg>;
  if (name === 'back') return <svg {...props}><path d="M19 12H5M10 7l-5 5 5 5"/></svg>;
  if (name === 'spark') return <svg {...props}><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z"/></svg>;
  return null;
}

function StepRail({ step, onStep }) {
  return (
    <nav className="onboarding-rail" aria-label="Этапы настройки">
      {ONBOARDING_STEPS.map((item, index) => {
        const active = step === index;
        const done = step > index;
        return (
          <button
            key={item.id}
            type="button"
            className={`onboarding-rail__step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
            onClick={() => index <= step && onStep(index)}
            disabled={index > step}
          >
            <span className="onboarding-rail__index">{done ? <Icon name="check" size={15} /> : item.number}</span>
            <span className="onboarding-rail__copy">
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function ProgressCard({ step }) {
  const percent = Math.round(((step + 1) / ONBOARDING_STEPS.length) * 100);
  return (
    <aside className="onboarding-progress" aria-label={`Прогресс настройки ${percent}%`}>
      <div className="onboarding-progress__ring" style={{ '--progress': `${percent * 3.6}deg` }}>
        <span>{percent}%</span>
      </div>
      <div>
        <span className="onboarding-progress__eyebrow">Первый вход</span>
        <strong>Настроим кабинет за несколько минут</strong>
        <p>До завершения всех трёх шагов остальные разделы остаются заблокированными.</p>
      </div>
    </aside>
  );
}

function OrganizationResult({ organization, onConfirm, onEdit }) {
  return (
    <article className="organization-result">
      <div className="organization-result__top">
        <span className="organization-result__icon"><Icon name="building" size={23} /></span>
        <div>
          <span className="organization-result__status"><Icon name="check" size={13} /> Организация найдена</span>
          <h3>{organization.title}</h3>
          <p>{organization.status || 'Сведения получены'}</p>
        </div>
      </div>

      <dl className="organization-result__grid">
        <div><dt>ИНН</dt><dd>{organization.inn || '—'}</dd></div>
        {organization.type === 'ul' ? <div><dt>КПП</dt><dd>{organization.kpp || '—'}</dd></div> : null}
        <div><dt>ОГРН</dt><dd>{organization.ogrn || '—'}</dd></div>
        <div><dt>Адрес</dt><dd>{organization.address || '—'}</dd></div>
        <div><dt>Регистрация</dt><dd>{organization.registrationDate || '—'}</dd></div>
        <div><dt>Источник</dt><dd>{organization.demo ? 'Демо-режим' : 'ЕГРЮЛ / ФНС'}</dd></div>
      </dl>

      {organization.demo ? (
        <div className="organization-result__demo">
          <Icon name="spark" size={15} />
          Сейчас используются демонстрационные сведения. После подключения API здесь будут реальные данные ФНС.
        </div>
      ) : null}

      <div className="organization-result__actions">
        <button type="button" className="onboarding-btn onboarding-btn--ghost" onClick={onEdit}>Изменить ИНН</button>
        <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={onConfirm}>
          Подтвердить организацию <Icon name="arrow" size={17} />
        </button>
      </div>
    </article>
  );
}

function OrganizationStep({ draft, setDraft, onContinue }) {
  const organization = draft.organization;
  const [lookupState, setLookupState] = useState({ loading: false, error: '' });
  const [manualMode, setManualMode] = useState(false);
  const expectedLength = organization.type === 'ul' ? 10 : 12;
  const validInn = organization.inn.length === expectedLength;

  const invalidateConfirmation = (patch) => {
    setDraft((prev) => ({
      ...prev,
      organization: {
        ...prev.organization,
        ...patch,
        confirmed: false,
        source: '',
        demo: false,
      },
    }));
  };

  const lookup = async () => {
    if (!validInn) return;
    setLookupState({ loading: true, error: '' });
    try {
      const result = await lookupOrganizationByInn(organization.inn);
      const found = result.company || {};
      setDraft((prev) => ({
        ...prev,
        organization: {
          ...prev.organization,
          type: found.type === 'ip' ? 'ip' : 'ul',
          title: found.shortTitle || found.title || '',
          inn: found.inn || prev.organization.inn,
          kpp: found.kpp || '',
          ogrn: found.ogrn || '',
          address: found.address || '',
          status: found.status || '',
          registrationDate: found.registrationDate || '',
          confirmed: false,
          source: result.source || '',
          demo: Boolean(result.demo),
        },
      }));
      setManualMode(false);
    } catch (error) {
      setLookupState({ loading: false, error: error.message || 'Не удалось выполнить поиск' });
      return;
    }
    setLookupState({ loading: false, error: '' });
  };

  const manualReady = Boolean(organization.title.trim())
    && validInn
    && (organization.type === 'ip' ? organization.ogrn.length === 15 : organization.kpp.length === 9);

  const confirmManual = () => {
    if (!manualReady) return;
    setDraft((prev) => ({
      ...prev,
      organization: { ...prev.organization, confirmed: true, source: 'Ручной ввод' },
    }));
    onContinue();
  };

  if (organization.title && !manualMode && !organization.confirmed) {
    return (
      <div className="onboarding-step onboarding-step--organization">
        <div className="onboarding-step__heading">
          <span className="onboarding-kicker">Шаг 1 · организация</span>
          <h2>Проверьте найденную компанию</h2>
          <p>Мы заполнили основные реквизиты. Убедитесь, что выбрана именно ваша организация.</p>
        </div>
        <OrganizationResult
          organization={organization}
          onEdit={() => invalidateConfirmation({ title: '', kpp: '', ogrn: '', address: '', status: '', registrationDate: '' })}
          onConfirm={() => {
            setDraft((prev) => ({
              ...prev,
              organization: { ...prev.organization, confirmed: true },
            }));
            onContinue();
          }}
        />
      </div>
    );
  }

  return (
    <div className="onboarding-step onboarding-step--organization">
      <div className="onboarding-step__heading">
        <span className="onboarding-kicker">Шаг 1 · организация</span>
        <h2>{manualMode ? 'Заполните реквизиты вручную' : 'Найдём вашу организацию по ИНН'}</h2>
        <p>{manualMode ? 'Используйте ручной режим, если поиск временно недоступен.' : 'Введите ИНН — остальные официальные данные попробуем получить автоматически.'}</p>
      </div>

      <div className="organization-layout">
        <section className="organization-formCard">
          <div className="organization-type" aria-label="Тип организации">
            <button
              type="button"
              className={organization.type === 'ul' ? 'is-active' : ''}
              onClick={() => invalidateConfirmation({ type: 'ul', inn: '', kpp: '', ogrn: '', title: '' })}
            >
              <strong>Юридическое лицо</strong><span>ИНН 10 цифр</span>
            </button>
            <button
              type="button"
              className={organization.type === 'ip' ? 'is-active' : ''}
              onClick={() => invalidateConfirmation({ type: 'ip', inn: '', kpp: '', ogrn: '', title: '' })}
            >
              <strong>ИП</strong><span>ИНН 12 цифр</span>
            </button>
          </div>

          <label className={`onboarding-field onboarding-field--hero ${validInn ? 'is-valid' : ''}`}>
            <span>ИНН</span>
            <div className="onboarding-field__control">
              <input
                autoFocus
                value={organization.inn}
                onChange={(event) => invalidateConfirmation({ inn: onlyDigits(event.target.value, expectedLength), title: '', kpp: '', ogrn: '', address: '', status: '', registrationDate: '' })}
                inputMode="numeric"
                placeholder={organization.type === 'ul' ? '7701234567' : '772345678012'}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && validInn && !lookupState.loading && !manualMode) lookup();
                }}
              />
              <span className="onboarding-field__counter">{organization.inn.length}/{expectedLength}</span>
            </div>
          </label>

          {!manualMode ? (
            <button
              type="button"
              className="organization-searchBtn"
              disabled={!validInn || lookupState.loading}
              onClick={lookup}
            >
              <span className="organization-searchBtn__icon"><Icon name="search" size={19} /></span>
              <span>
                <strong>{lookupState.loading ? 'Ищем организацию…' : 'Найти организацию'}</strong>
                <small>Поиск через подключённый backend ЕГРЮЛ</small>
              </span>
              <Icon name="arrow" size={18} />
            </button>
          ) : (
            <div className="organization-manualFields">
              <label className="onboarding-field">
                <span>Наименование</span>
                <input value={organization.title} onChange={(event) => invalidateConfirmation({ title: event.target.value })} placeholder="ООО «Название»" />
              </label>
              {organization.type === 'ul' ? (
                <label className="onboarding-field">
                  <span>КПП</span>
                  <input value={organization.kpp} onChange={(event) => invalidateConfirmation({ kpp: onlyDigits(event.target.value, 9) })} inputMode="numeric" placeholder="9 цифр" />
                </label>
              ) : (
                <label className="onboarding-field">
                  <span>ОГРН</span>
                  <input value={organization.ogrn} onChange={(event) => invalidateConfirmation({ ogrn: onlyDigits(event.target.value, 15) })} inputMode="numeric" placeholder="15 цифр" />
                </label>
              )}
              <label className="onboarding-field onboarding-field--wide">
                <span>Юридический адрес <em>необязательно</em></span>
                <input value={organization.address} onChange={(event) => invalidateConfirmation({ address: event.target.value })} placeholder="г. Москва" />
              </label>
            </div>
          )}

          {lookupState.error ? <div className="onboarding-error" role="alert">{lookupState.error}</div> : null}

          <div className="organization-formCard__footer">
            <button type="button" className="onboarding-linkBtn" onClick={() => { setManualMode((value) => !value); setLookupState({ loading: false, error: '' }); }}>
              {manualMode ? 'Вернуться к поиску по ИНН' : 'Не нашли организацию? Заполнить вручную'}
            </button>
            {manualMode ? (
              <button type="button" className="onboarding-btn onboarding-btn--primary" disabled={!manualReady} onClick={confirmManual}>
                Подтвердить данные <Icon name="arrow" size={17} />
              </button>
            ) : null}
          </div>
        </section>

        <aside className="organization-aside">
          <div className="organization-aside__icon"><Icon name="shield" size={28} /></div>
          <span className="onboarding-kicker">Почему это нужно</span>
          <h3>Привяжем кабинет к реальному бизнесу</h3>
          <ul>
            <li><Icon name="check" size={14} /> корректные данные в отчётах;</li>
            <li><Icon name="check" size={14} /> точное подключение площадок;</li>
            <li><Icon name="check" size={14} /> безопасная работа команды.</li>
          </ul>
          <div className="organization-aside__source">
            <span><Icon name="building" size={16} /> Источник данных</span>
            <strong>ЕГРЮЛ / сервис ФНС</strong>
            <small>Frontend не обращается к ФНС напрямую: запрос проходит через ваш backend.</small>
          </div>
        </aside>
      </div>
    </div>
  );
}

function IntegrationStep({ draft, setDraft, onBack, onContinue }) {
  const enabledCount = Object.values(draft.integrations).filter((item) => item.enabled).length;

  const update = (id, patch) => {
    setDraft((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [id]: { ...prev.integrations[id], ...patch },
      },
    }));
  };

  return (
    <div className="onboarding-step">
      <div className="onboarding-step__heading onboarding-step__heading--split">
        <div>
          <span className="onboarding-kicker">Шаг 2 · интеграции</span>
          <h2>Подключите площадки</h2>
          <p>Начните с каналов, где уже есть отзывы. Остальные можно подключить позже в настройках.</p>
        </div>
        <div className="integration-summary"><strong>{enabledCount}</strong><span>выбрано</span></div>
      </div>

      <div className="integration-grid">
        {INTEGRATION_ITEMS.map((item) => {
          const value = draft.integrations[item.id];
          return (
            <article key={item.id} className={`integration-card is-${item.tone} ${value.enabled ? 'is-enabled' : ''}`}>
              <div className="integration-card__head">
                <span className="integration-card__mark">{item.name.slice(0, 1)}</span>
                <div>
                  <small>{item.category}{item.recommended ? ' · рекомендуем' : ''}</small>
                  <h3>{item.name}</h3>
                </div>
                <button
                  type="button"
                  className={`integration-switch ${value.enabled ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={value.enabled}
                  onClick={() => update(item.id, { enabled: !value.enabled })}
                ><span /></button>
              </div>
              <p>{item.description}</p>
              <label className="integration-card__field">
                <span><Icon name="link" size={14} /> Ссылка на карточку</span>
                <input
                  value={value.link}
                  disabled={!value.enabled}
                  onChange={(event) => update(item.id, { link: event.target.value })}
                  placeholder={item.placeholder}
                />
              </label>
            </article>
          );
        })}
      </div>

      <div className="onboarding-actions">
        <button type="button" className="onboarding-btn onboarding-btn--ghost" onClick={onBack}><Icon name="back" size={17} /> Назад</button>
        <div className="onboarding-actions__right">
          <span>Ссылки можно добавить позже</span>
          <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={onContinue}>Продолжить <Icon name="arrow" size={17} /></button>
        </div>
      </div>
    </div>
  );
}

function PinDots({ value }) {
  return <div className="security-pinDots">{Array.from({ length: 4 }).map((_, index) => <span key={index} className={index < value.length ? 'is-filled' : ''} />)}</div>;
}

function SecurityStep({ draft, setDraft, onBack, onFinish, finishing }) {
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const complete = pin.length === 4 && repeat.length === 4;
  const ready = complete && pin === repeat;

  const addDigit = (digit) => {
    if (pin.length < 4) {
      setPin((value) => `${value}${digit}`.slice(0, 4));
      return;
    }
    if (repeat.length < 4) setRepeat((value) => `${value}${digit}`.slice(0, 4));
  };

  const removeDigit = () => {
    if (repeat.length) setRepeat((value) => value.slice(0, -1));
    else setPin((value) => value.slice(0, -1));
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (finishing || confirmed) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        addDigit(event.key);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        removeDigit();
      } else if (event.key === 'Enter' && complete) {
        event.preventDefault();
        if (ready) setConfirmed(true);
        else setError('PIN-коды не совпадают');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pin, repeat, complete, ready, finishing, confirmed]);

  useEffect(() => {
    if (!ready || confirmed || finishing) return;
    setError('');
    setConfirmed(true);
  }, [ready, confirmed, finishing]);

  useEffect(() => {
    if (!confirmed || finishing) return undefined;
    const timer = window.setTimeout(() => onFinish(pin), 720);
    return () => window.clearTimeout(timer);
  }, [confirmed, finishing, onFinish, pin]);

  const finish = () => {
    if (!ready) {
      setError(pin !== repeat && repeat.length === 4 ? 'PIN-коды не совпадают' : 'Введите и повторите PIN из 4 цифр');
      return;
    }
    setError('');
    setConfirmed(true);
  };

  return (
    <div className="onboarding-step security-step">
      <div className="onboarding-step__heading">
        <span className="onboarding-kicker">Шаг 3 · безопасность</span>
        <h2>Создайте PIN для кабинета</h2>
        <p>PIN защищает рабочее пространство при блокировке и возвращении к компьютеру.</p>
      </div>

      <div className="security-layout">
        <section className={`security-card ${confirmed ? 'is-confirmed' : ''}`} aria-live="polite">
          {confirmed ? (
            <div className="security-card__confirmed">
              <span className="security-card__confirmedIcon"><Icon name="check" size={31} /></span>
              <h3>PIN подтверждён</h3>
              <p>Защита кабинета активирована. Завершаем первичную настройку…</p>
            </div>
          ) : (
            <>
              <div className="security-card__shield"><Icon name="shield" size={29} /></div>
              <h3>{pin.length < 4 ? 'Придумайте PIN' : 'Повторите PIN'}</h3>
              <p>{pin.length < 4 ? 'Используйте четыре цифры, которые легко запомнить вам и сложно угадать другим.' : 'Введите тот же код ещё раз для подтверждения.'}</p>
              <PinDots value={pin.length < 4 ? pin : repeat} />

              <div className="security-keypad">
                {[1,2,3,4,5,6,7,8,9].map((digit) => <button key={digit} type="button" onClick={() => addDigit(String(digit))}>{digit}</button>)}
                <span />
                <button type="button" onClick={() => addDigit('0')}>0</button>
                <button type="button" className="security-keypad__delete" onClick={removeDigit}>⌫</button>
              </div>
              {error ? <div className="onboarding-error" role="alert">{error}</div> : null}
            </>
          )}
        </section>

        <aside className={`security-options ${confirmed ? 'is-locked' : ''}`}>
          <span className="onboarding-kicker">Политика блокировки</span>
          <h3>Защита уже настроена</h3>
          <p>Мы применим безопасные значения по умолчанию. Изменить их можно будет в профиле.</p>

          <label className="security-option">
            <div><strong>Автоблокировка</strong><span>Блокировать кабинет при бездействии</span></div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.security.autoLock}
              className={`integration-switch ${draft.security.autoLock ? 'is-on' : ''}`}
              disabled={confirmed || finishing}
              onClick={() => setDraft((prev) => ({ ...prev, security: { ...prev.security, autoLock: !prev.security.autoLock } }))}
            ><span /></button>
          </label>

          <label className="security-select">
            <span>Период бездействия</span>
            <select
              value={draft.security.sessionMinutes}
              disabled={!draft.security.autoLock || confirmed || finishing}
              onChange={(event) => setDraft((prev) => ({ ...prev, security: { ...prev.security, sessionMinutes: Number(event.target.value) } }))}
            >
              <option value={5}>5 минут</option>
              <option value={15}>15 минут</option>
              <option value={30}>30 минут</option>
              <option value={60}>60 минут</option>
            </select>
          </label>

          <div className="security-options__note"><Icon name="lock" size={17} /><span>После завершения настройки кнопка «Заблокировать» в верхнем меню станет активной.</span></div>
        </aside>
      </div>

      {confirmed ? (
        <div className="onboarding-pinToast" role="status">
          <span><Icon name="check" size={16} /></span>
          <div><strong>PIN успешно создан</strong><small>Защита рабочего пространства включена</small></div>
        </div>
      ) : null}

      <div className="onboarding-actions">
        <button type="button" className="onboarding-btn onboarding-btn--ghost" onClick={onBack} disabled={finishing || confirmed}><Icon name="back" size={17} /> Назад</button>
        <button type="button" className="onboarding-btn onboarding-btn--primary" onClick={finish} disabled={!complete || finishing || confirmed}>
          {confirmed ? 'PIN подтверждён' : (finishing ? 'Открываем кабинет…' : 'Завершить настройку')} {!finishing && !confirmed ? <Icon name="arrow" size={17} /> : null}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingWorkspace() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => readOnboardingDraft());
  const [finishing, setFinishing] = useState(false);
  const [configuration, setConfiguration] = useState(null);
  const step = Math.max(0, Math.min(2, Number(draft.step) || 0));

  useEffect(() => {
    saveOnboardingDraft({ ...draft, step });
  }, [draft, step]);

  const setStep = (nextStep) => setDraft((prev) => ({ ...prev, step: nextStep }));
  const progressLabel = useMemo(() => `${step + 1} из ${ONBOARDING_STEPS.length}`, [step]);

  const finishOnboarding = useCallback(async (pin) => {
    setFinishing(true);
    const applied = await applyOnboardingConfiguration({ draft, pin });
    setConfiguration(applied);
    clearOnboardingDraft();

    await new Promise((resolve) => window.setTimeout(resolve, 720));
    navigate('/dashboard', { replace: true });
  }, [draft, navigate]);

  return (
    <div className={`onboarding ${finishing ? 'is-finishing' : ''}`}>
      <header className="onboarding-hero">
        <div className="onboarding-hero__copy">
          <span className="onboarding-kicker">Первичная настройка</span>
          <h1>Подготовим Бизнес Щит к работе</h1>
          <p>Три коротких шага — и кабинет будет готов к мониторингу репутации.</p>
        </div>
        <ProgressCard step={step} />
      </header>

      <StepRail step={step} onStep={setStep} />

      <section className="onboarding-panel" aria-label={`Этап ${progressLabel}`}>
        {step === 0 ? (
          <OrganizationStep draft={draft} setDraft={setDraft} onContinue={() => setStep(1)} />
        ) : null}
        {step === 1 ? (
          <IntegrationStep draft={draft} setDraft={setDraft} onBack={() => setStep(0)} onContinue={() => setStep(2)} />
        ) : null}
        {step === 2 ? (
          <SecurityStep draft={draft} setDraft={setDraft} onBack={() => setStep(1)} onFinish={finishOnboarding} finishing={finishing} />
        ) : null}
      </section>

      {finishing ? (
        <div className="onboarding-complete" role="status" aria-live="polite">
          <span className="onboarding-complete__icon"><Icon name="check" size={28} /></span>
          <strong>{configuration ? 'Кабинет настроен' : 'Применяем настройки'}</strong>
          <span>{configuration ? 'Открываем рабочее пространство…' : 'Связываем организацию, площадки и защиту'}</span>
          <div className="onboarding-complete__sync">
            <span className={configuration ? 'is-done' : ''}><i>{configuration ? '✓' : '1'}</i> Профиль компании</span>
            <span className={configuration ? 'is-done' : ''}><i>{configuration ? '✓' : '2'}</i> Интеграции</span>
            <span className={configuration ? 'is-done' : ''}><i>{configuration ? '✓' : '3'}</i> Автоблокировка</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
