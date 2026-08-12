import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BrandMark from '../../components/brand/BrandMark';
import {
  BILLING_PERIODS,
  MANAGED_SERVICES,
  PRICING_PLANS,
  SOFTWARE_ADDONS,
  calculatePlanTotal,
  formatPrice,
  mergeServerCatalog,
} from './model/pricingData';
import { pricingService } from '../../services/billing/pricingService';
import { authService } from '../../services/auth/authService';
import './PricingWorkspace.scss';

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function PlanCard({ plan, billingId, onSelect }) {
  const totals = calculatePlanTotal(plan, billingId, 0);
  const monthlyEquivalent = totals.total / totals.billing.months;
  const annualSavings = plan.monthlyPrice * 12 - calculatePlanTotal(plan, 'annual', 0).total;

  return (
    <article className={`pricing-plan pricing-plan--${plan.accent} ${plan.popular ? 'is-popular' : ''}`}>
      {plan.popular ? <div className="pricing-plan__popular"><span>●</span> Рекомендуем</div> : null}
      <div className="pricing-plan__top">
        <span className="pricing-plan__eyebrow">{plan.eyebrow}</span>
        <h2>{plan.name}</h2>
        <p>{plan.description}</p>
      </div>

      <div className="pricing-plan__price">
        {plan.pricePrefix ? <small className="pricing-plan__pricePrefix">{plan.pricePrefix}</small> : null}
        <strong>{formatPrice(monthlyEquivalent)}</strong>
        <span>/ месяц</span>
        {billingId === 'annual'
          ? <small>Оплата за год: {formatPrice(totals.total)} · экономия {formatPrice(annualSavings)}</small>
          : <small>Годовая оплата экономит {formatPrice(annualSavings)}</small>}
      </div>

      <button type="button" className="pricing-plan__cta" onClick={() => onSelect(plan)}>
        {plan.cta} <Arrow />
      </button>

      <div className="pricing-plan__divider" />
      <h3 className="pricing-plan__sectionTitle">Что даёт тариф</h3>
      <ul className="pricing-plan__outcomes">
        {plan.outcomes.map((outcome) => (
          <li key={outcome}><span className="pricing-plan__check"><Check /></span><span>{outcome}</span></li>
        ))}
      </ul>

      <div className="pricing-plan__limits">
        <h3 className="pricing-plan__sectionTitle">Лимиты</h3>
        {plan.limits.map(([label, key, value]) => (
          <div key={key}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
    </article>
  );
}

function CheckoutPanel({ plan, billingId, onClose, onProceed, busy, message }) {
  const totals = calculatePlanTotal(plan, billingId, 0);
  const monthlyEquivalent = totals.total / totals.billing.months;

  return (
    <div className="pricing-checkout" role="dialog" aria-modal="true" aria-labelledby="pricing-checkout-title">
      <button className="pricing-checkout__backdrop" type="button" aria-label="Закрыть" onClick={onClose} />
      <section className="pricing-checkout__panel">
        <header>
          <div>
            <span>Подписка Бизнес Щит</span>
            <h2 id="pricing-checkout-title">{plan.name}</h2>
          </div>
          <button type="button" className="pricing-checkout__close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="pricing-checkout__summary">
          <div><span>Период</span><strong>{BILLING_PERIODS[billingId].label}</strong></div>
          <div><span>Эквивалент в месяц</span><strong>{formatPrice(monthlyEquivalent)}</strong></div>
          {totals.billingDiscount > 0 ? <div className="is-discount"><span>Экономия за год</span><strong>−{formatPrice(totals.billingDiscount)}</strong></div> : null}
        </div>

        <div className="pricing-checkout__total">
          <span>Итого к оформлению</span>
          <strong>{formatPrice(totals.total)}</strong>
          <small>{billingId === 'annual' ? 'за 12 месяцев' : 'за первый месяц'}</small>
        </div>

        {message ? <div className="pricing-checkout__message" role="status">{message}</div> : null}

        <button type="button" className="pricing-checkout__pay" onClick={() => onProceed(totals)} disabled={busy}>
          {busy ? 'Проверяем сессию…' : 'Продолжить'} <Arrow />
        </button>

        <p className="pricing-checkout__legal">
          Платёж создаётся только реальным серверным провайдером. Если online checkout ещё не подключён, Бизнес Щит не создаёт фиктивную оплату и не списывает средства.
        </p>
      </section>
    </div>
  );
}

function ExtrasSection() {
  return (
    <>
      <section className="pricing-section pricing-section--extras" id="addons">
        <div className="pricing-section__heading">
          <span>Software add-ons</span>
          <h2>Расширяйте usage без лишней смены тарифа</h2>
          <p>Дополнительные объёмы относятся к продукту и считаются отдельно от человеческой работы.</p>
        </div>
        <div className="pricing-extrasGrid">
          {SOFTWARE_ADDONS.map((item) => (
            <article className="pricing-extraCard" key={item.id}>
              <span>ADD-ON</span>
              <h3>{item.title}</h3>
              <strong>+{formatPrice(item.price)}<small>/мес</small></strong>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-section pricing-section--managed" id="managed-services">
        <div className="pricing-section__heading">
          <span>Managed services</span>
          <h2>Экспертиза людей — отдельный сервисный слой</h2>
          <p>Ответы специалистов, legal, content и crisis response не маскируются под «безлимитные функции» SaaS.</p>
        </div>
        <div className="pricing-extrasGrid pricing-extrasGrid--managed">
          {MANAGED_SERVICES.map((service) => (
            <article className="pricing-extraCard pricing-extraCard--managed" key={service.id}>
              <span>SERVICE</span>
              <h3>{service.title}</h3>
              <strong>{service.prefix ? `${service.prefix} ` : ''}{formatPrice(service.price)}<small>{service.suffix}</small></strong>
              <p>{service.description}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export default function PricingWorkspace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingId, setBillingId] = useState('monthly');
  const [serverPlans, setServerPlans] = useState([]);
  const [catalogState, setCatalogState] = useState('loading');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');

  const plans = useMemo(() => mergeServerCatalog(PRICING_PLANS, serverPlans), [serverPlans]);

  useEffect(() => {
    const controller = new AbortController();
    pricingService.getCatalog({ signal: controller.signal })
      .then((items) => {
        setServerPlans(items);
        setCatalogState(items.length === 4 ? 'ready' : 'fallback');
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setCatalogState('fallback');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const checkoutId = String(searchParams.get('checkout') || '').toUpperCase();
    if (!checkoutId) return;
    const plan = plans.find((item) => item.id === checkoutId);
    if (plan && !plan.contactSales) setSelectedPlan(plan);
  }, [plans, searchParams]);

  const openPlan = async (plan) => {
    setCheckoutMessage('');
    if (plan.contactSales) {
      try {
        await authService.restoreSession();
        navigate('/chat?topic=business');
      } catch (error) {
        if (error?.status === 401) {
          navigate(`/auth?mode=register&next=${encodeURIComponent('/chat?topic=business')}`);
          return;
        }
        setCheckoutMessage(error?.message || 'Не удалось проверить сессию');
      }
      return;
    }
    setSelectedPlan(plan);
    const next = new URLSearchParams(searchParams);
    next.set('checkout', plan.id);
    setSearchParams(next, { replace: true });
  };

  const closeCheckout = () => {
    setSelectedPlan(null);
    setCheckoutMessage('');
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    setSearchParams(next, { replace: true });
  };

  const proceed = async (totals) => {
    if (!selectedPlan) return;
    setCheckoutBusy(true);
    setCheckoutMessage('');
    try {
      await authService.restoreSession();
    } catch (error) {
      if (error?.status === 401) {
        setCheckoutBusy(false);
        navigate(`/auth?mode=register&next=${encodeURIComponent(`/pricing?checkout=${selectedPlan.id}`)}`);
        return;
      }
      setCheckoutMessage(error?.message || 'Не удалось проверить сессию');
      setCheckoutBusy(false);
      return;
    }

    try {
      const result = await pricingService.createCheckout({
        planId: selectedPlan.id,
        billing: billingId,
        amount: Math.round(totals.total),
        currency: 'RUB',
        returnUrl: `${window.location.origin}/pricing?checkout=${selectedPlan.id}`,
      });
      if (result?.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }
      setCheckoutMessage('Платёжный провайдер не вернул ссылку оформления. Средства не списаны.');
    } catch (error) {
      if (error?.status === 503) {
        setCheckoutMessage('Онлайн-оплата пока не подключена. Средства не списаны; тариф и цена сохранены в каталоге без фиктивной платёжной сессии.');
      } else {
        setCheckoutMessage(error?.message || 'Не удалось создать платёжную сессию');
      }
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <main className="pricing-page">
      <header className="pricing-header">
        <Link className="pricing-header__brand" to="/" aria-label="Бизнес Щит — главная">
          <BrandMark size={42} />
          <span><strong>БИЗНЕС ЩИТ</strong><small>Reputation Operations System</small></span>
        </Link>
        <nav><Link to="/">Главная</Link><a href="#plans">Тарифы</a><a href="#addons">Add-ons</a><button type="button" onClick={() => navigate('/auth?mode=login')}>Войти</button></nav>
      </header>

      <section className="pricing-hero">
        <div className="pricing-hero__glow" aria-hidden="true" />
        <span className="pricing-kicker"><i /> 4 SaaS-тарифа · отдельные managed services · прозрачные лимиты</span>
        <h1>Платите за масштаб<br/><em>репутационных операций</em></h1>
        <p>Тариф определяет capability и governance. Рост цены объясняется локациями, review volume, AI и командой — не скрытым ручным трудом.</p>
        <div className="pricing-billing" role="group" aria-label="Период оплаты">
          {Object.values(BILLING_PERIODS).map((period) => (
            <button key={period.id} type="button" className={billingId === period.id ? 'is-active' : ''} onClick={() => setBillingId(period.id)}>
              {period.label}{period.discount ? <span>−15%</span> : null}
            </button>
          ))}
        </div>
        <div className="pricing-hero__trust">
          <span>14-дневный Pro trial после регистрации</span>
          <span>Usage предупреждения на 70% / 90% / 100%</span>
          <span>Managed services подключаются отдельно</span>
        </div>
        {catalogState === 'fallback' ? (
          <div className="pricing-catalogNotice" role="status">Показываем зафиксированную публичную матрицу. Серверный каталог временно недоступен.</div>
        ) : null}
      </section>

      <section className="pricing-section" id="plans">
        <div className="pricing-section__heading">
          <span>Тарифы</span>
          <h2>От одной точки до multi-location governance</h2>
          <p>Каждый пакет показывает outcome и единицы потребления — locations, sources, reviews, users, AI и retention.</p>
        </div>
        <div className="pricing-grid pricing-grid--four">
          {plans.map((plan) => <PlanCard key={plan.id} plan={plan} billingId={billingId} onSelect={openPlan} />)}
        </div>
      </section>

      <ExtrasSection />

      <section className="pricing-security">
        <div><span className="pricing-security__icon">✓</span><strong>Backend определяет entitlement и usage</strong><p>UI показывает лимиты, но не выдаёт себе права. Ограничения проверяются сервером в контексте организации.</p></div>
        <div><span className="pricing-security__icon">↺</span><strong>Критический reply workflow не блокируется внезапно</strong><p>Review/AI volume сначала даёт предупреждение и grace/overage путь; hard limits применяются к расширению ресурсов вроде новых локаций.</p></div>
      </section>

      {selectedPlan ? (
        <CheckoutPanel
          plan={selectedPlan}
          billingId={billingId}
          onClose={closeCheckout}
          onProceed={proceed}
          busy={checkoutBusy}
          message={checkoutMessage}
        />
      ) : null}
    </main>
  );
}
