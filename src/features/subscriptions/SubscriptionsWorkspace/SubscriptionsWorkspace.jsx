import React, { memo, useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import CurrentPlan from '../CurrentPlan';
import PlanLimits from '../PlanLimits';
import PaymentHistory from '../PaymentHistory';
import useSubscriptions from '../hooks/useSubscriptions';
import { formatCurrency } from '../model/formatters';
import './SubscriptionsWorkspace.scss';
import './SubscriptionsRecovery.scss';
import useAccessControl from '../../access/hooks/useAccessControl';

const CONSTRUCTOR_MODULES = Object.freeze([
  { id: 'reviews', title: 'Работа с отзывами', copy: 'Обязательное ядро: мониторинг, статусы и единое рабочее место для отзывов.', required: true },
  { id: 'acquisition', title: 'Сбор отзывов', copy: 'QR, ссылки и сценарии получения новых отзывов.' },
  { id: 'analytics', title: 'Аналитика репутации', copy: 'Динамика рейтинга, проблемы и управленческие выводы.' },
  { id: 'automations', title: 'Автоматизации', copy: 'Триггеры, задачи и автоматические действия.' },
  { id: 'ai', title: 'AI-инструменты', copy: 'AI-ответы, Ask Shield и анализ видимости.' },
  { id: 'competitive', title: 'Конкуренты', copy: 'Сравнение репутации и динамики с конкурентами.' },
  { id: 'integrations', title: 'Интеграции', copy: 'Подключение внешних систем и расширенный обмен данными.' },
]);

const PLAN_FEATURE_LABELS = Object.freeze({
  analytics: 'Аналитика',
  automations: 'Автоматизации',
  reports: 'Отчёты',
  apiAccess: 'API-доступ',
  aiFeatures: 'AI-инструменты',
  competitive: 'Конкуренты',
  integrations: 'Интеграции',
});

const CONSTRUCTOR_LIMITS = Object.freeze({
  businesses: 50,
  locations: 250,
  users: 100,
});

function SubscriptionSkeleton() {
  return (
    <div className="subscriptions-skeleton" aria-label="Загрузка подписки">
      <div className="subscriptions-skeleton__top">
        <span className="subscriptions-skeleton__hero" />
        <span className="subscriptions-skeleton__limits" />
      </div>
      <span className="subscriptions-skeleton__store" />
    </div>
  );
}

function planFeatureSummary(plan) {
  const entitlements = plan?.entitlements || {};
  const capabilities = Object.entries(PLAN_FEATURE_LABELS)
    .filter(([key]) => entitlements[key] === true)
    .map(([, label]) => label);

  const limits = [
    entitlements.maxLocations ? `${entitlements.maxLocations} локац.` : null,
    entitlements.maxUsers ? `${entitlements.maxUsers} польз.` : null,
    entitlements.maxReviewSources ? `${entitlements.maxReviewSources} источн.` : null,
  ].filter(Boolean);

  return [...capabilities, ...limits].slice(0, 6);
}

function SubscriptionsWorkspace() {
  const subscription = useSubscriptions();
  const access = useAccessControl();
  const canManage = access.can('billing.manage');
  const [selectionMode, setSelectionMode] = useState('ready');
  const [constructor, setConstructor] = useState({
    businesses: 1,
    locations: 1,
    users: 1,
    modules: ['reviews'],
  });
  const [constructorQuote, setConstructorQuote] = useState(null);
  const [quoteState, setQuoteState] = useState('idle');
  const quoteConstructor = subscription.quoteConstructor;

  useEffect(() => {
    if (selectionMode !== 'constructor') return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuoteState('loading');
      quoteConstructor(constructor, { signal: controller.signal })
        .then((quote) => {
          if (controller.signal.aborted) return;
          setConstructorQuote(quote);
          setQuoteState(quote ? 'ready' : 'unavailable');
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          setConstructorQuote(null);
          setQuoteState('error');
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [constructor, quoteConstructor, selectionMode]);

  if (subscription.loading) return <SubscriptionSkeleton />;

  if (subscription.error || !subscription.snapshot) {
    return (
      <section className="subscriptions-error">
        <div className="subscriptions-error__mark">!</div>
        <div><h2>Подписка временно недоступна</h2><p>{subscription.error || 'Не удалось получить данные подписки.'}</p></div>
        <Button onClick={subscription.reload}>Повторить</Button>
      </section>
    );
  }

  const {
    plan,
    limits,
    payments = [],
    trial,
    paymentProviderConfigured,
    availablePlans = [],
  } = subscription.snapshot;

  const toggleModule = (id) => {
    if (id === 'reviews') return;
    setConstructor((current) => ({
      ...current,
      modules: current.modules.includes(id)
        ? current.modules.filter((item) => item !== id)
        : [...current.modules, id],
    }));
  };

  const setCount = (key, value) => {
    const max = CONSTRUCTOR_LIMITS[key] || 1;
    const normalized = Math.min(max, Math.max(1, Number(value) || 1));
    setConstructor((current) => ({ ...current, [key]: normalized }));
  };

  return (
    <div className="subscriptions-workspace subscriptions-workspace--recovered">
      <div className="subscriptions-workspace__top">
        <CurrentPlan
          plan={plan}
          renewalBusy={subscription.busy.renewal}
          onToggleRenewal={subscription.toggleAutoRenew}
          canManage={canManage && Boolean(paymentProviderConfigured)}
        />
        <PlanLimits limits={limits} />
      </div>

      {canManage ? (
        <section className="subscriptions-choice" aria-label="Способ подбора тарифа">
          <div className="subscriptions-choice__copy">
            <span>Подбор решения</span>
            <h2>Как удобнее собрать тариф?</h2>
            <p>Готовый тариф — быстрый старт. Конструктор — только нужные функции и объёмы.</p>
          </div>
          <div className="subscriptions-choice__switch" role="tablist" aria-label="Режим выбора тарифа">
            <button
              type="button"
              role="tab"
              aria-selected={selectionMode === 'ready'}
              className={selectionMode === 'ready' ? 'is-active' : ''}
              onClick={() => setSelectionMode('ready')}
            >
              Готовые тарифы
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectionMode === 'constructor'}
              className={selectionMode === 'constructor' ? 'is-active' : ''}
              onClick={() => setSelectionMode('constructor')}
            >
              Конструктор
            </button>
          </div>
        </section>
      ) : null}

      {canManage && selectionMode === 'ready' ? (
        <section className="subscriptions-ready" aria-label="Готовые тарифы">
          <div className="subscriptions-ready__head">
            <div><span>Готовые решения</span><h2>Выберите понятный набор возможностей</h2></div>
            <p>Цена и доступы приходят из единого серверного каталога.</p>
          </div>
          <div className="subscriptions-ready__grid">
            {availablePlans.map((item) => {
              const current = item.code === plan.code;
              const features = planFeatureSummary(item);
              const canPay = item.code === 'PRO' && !current && paymentProviderConfigured;
              return (
                <article className={`subscriptions-ready__card ${current ? 'is-current' : ''}`} key={item.code}>
                  <div className="subscriptions-ready__card-head">
                    <div><small>{current ? 'Текущий тариф' : 'Готовый тариф'}</small><h3>{item.name}</h3></div>
                    <strong>{Number(item.price || 0).toLocaleString('ru-RU')} ₽<span>/ мес.</span></strong>
                  </div>
                  <ul>{features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  {item.code === 'PRO' && trial?.available ? (
                    <Button onClick={subscription.startTrial} disabled={subscription.busy.trial || subscription.busy.checkout}>
                      {subscription.busy.trial ? 'Активируем…' : 'Попробовать PRO 14 дней'}
                    </Button>
                  ) : null}
                  {canPay ? (
                    <Button onClick={() => subscription.checkoutPlan('PRO')} disabled={subscription.busy.checkout || subscription.busy.trial}>
                      {subscription.busy.checkout ? 'Создаём платёж…' : `Оплатить PRO · ${formatCurrency(item.price)}`}
                    </Button>
                  ) : current ? <span className="subscriptions-ready__current">Активен</span> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {canManage && selectionMode === 'constructor' ? (
        <section className="subscriptions-constructor" aria-label="Конструктор тарифа">
          <div className="subscriptions-constructor__head">
            <div><span>Конструктор</span><h2>Соберите только то, что действительно нужно</h2></div>
            <p>Цена рассчитывается backend по выбранным объёмам и модулям. Подменить её из браузера нельзя.</p>
          </div>

          <div className="subscriptions-constructor__counts">
            {[
              ['businesses', 'Компании'],
              ['locations', 'Локации'],
              ['users', 'Пользователи'],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="number"
                  min="1"
                  max={CONSTRUCTOR_LIMITS[key]}
                  value={constructor[key]}
                  onChange={(event) => setCount(key, event.target.value)}
                />
                <small>до {CONSTRUCTOR_LIMITS[key]}</small>
              </label>
            ))}
          </div>

          <div className="subscriptions-constructor__modules">
            {CONSTRUCTOR_MODULES.map((module) => {
              const selected = constructor.modules.includes(module.id);
              return (
                <button
                  type="button"
                  className={selected ? 'is-selected' : ''}
                  aria-pressed={selected}
                  aria-disabled={Boolean(module.required)}
                  disabled={Boolean(module.required)}
                  onClick={() => toggleModule(module.id)}
                  key={module.id}
                >
                  <span>{selected ? '✓' : '+'}</span>
                  <div><strong>{module.title}</strong><small>{module.copy}</small></div>
                </button>
              );
            })}
          </div>

          <div className="subscriptions-constructor__summary">
            <div>
              <span>Ваш набор</span>
              <strong>{constructor.businesses} комп. · {constructor.locations} локац. · {constructor.users} польз. · {constructor.modules.length} мод.</strong>
            </div>
            {quoteState === 'loading' ? <p>Пересчитываем стоимость на сервере…</p> : null}
            {quoteState === 'error' ? <p>Не удалось получить серверную стоимость. Оплата заблокирована до успешного расчёта.</p> : null}
            {constructorQuote ? (
              <div className="subscriptions-constructor__quote">
                <span>Стоимость</span>
                <strong>{formatCurrency(constructorQuote.amount)}<small>/ мес.</small></strong>
              </div>
            ) : null}
            {paymentProviderConfigured ? (
              <Button
                onClick={() => subscription.checkoutConstructor(constructor)}
                disabled={!constructorQuote || quoteState !== 'ready' || subscription.busy.checkout}
              >
                {subscription.busy.checkout ? 'Создаём платёж…' : 'Оплатить конфигурацию'}
              </Button>
            ) : (
              <p>Онлайн-оплата ещё не подключена. Конфигурация и серверная стоимость доступны без фиктивного списания.</p>
            )}
          </div>
        </section>
      ) : null}

      {!paymentProviderConfigured ? (
        <section className="subscriptions-payment-note">
          <div><strong>Онлайн-оплата пока не подключена</strong><span>Мы не показываем фиктивную оплату. Текущий тариф и лимиты работают, а PRO можно безопасно протестировать без карты.</span></div>
        </section>
      ) : null}

      {!canManage ? <section className="subscriptions-workspace__read-only"><strong>Подписка доступна только для просмотра</strong><span>Изменение тарифа ограничено вашей ролью.</span></section> : null}

      {payments.length ? <PaymentHistory payments={payments} onDownload={subscription.downloadReceipt} /> : null}

      {subscription.notice ? (
        <div className={`subscriptions-toast subscriptions-toast--${subscription.notice.tone}`} role="status" key={subscription.notice.id}>
          <span />{subscription.notice.message}
        </div>
      ) : null}
    </div>
  );
}

export default memo(SubscriptionsWorkspace);
