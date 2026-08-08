import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BrandMark from '../../components/brand/BrandMark';
import { BILLING_PERIODS, BUILDER_OPTIONS, PRICING_PLANS, calculatePlanTotal, formatPrice } from './model/pricingData';
import { pricingService } from '../../services/billing/pricingService';
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

  return (
    <article className={`pricing-plan pricing-plan--${plan.accent} ${plan.popular ? 'is-popular' : ''}`}>
      {plan.popular ? <div className="pricing-plan__popular"><span>●</span> Чаще выбирают</div> : null}
      <div className="pricing-plan__top">
        <span className="pricing-plan__eyebrow">{plan.eyebrow}</span>
        <h2>{plan.name}</h2>
        <p>{plan.description}</p>
      </div>

      <div className="pricing-plan__price">
        <strong>{formatPrice(monthlyEquivalent)}</strong>
        <span>/ месяц</span>
        {billingId === 'annual' ? <small>Оплата за год: {formatPrice(totals.total)}</small> : <small>Можно отменить в любой момент</small>}
      </div>

      <button type="button" className="pricing-plan__cta" onClick={() => onSelect(plan)}>
        Выбрать тариф <Arrow />
      </button>

      <div className="pricing-plan__divider" />
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}><span className="pricing-plan__check"><Check /></span><span>{feature}</span></li>
        ))}
      </ul>
    </article>
  );
}

function CheckoutPanel({ plan, billingId, promoState, onClose, onPromo, onProceed, busy, message }) {
  const [promoInput, setPromoInput] = useState('');
  const totals = calculatePlanTotal(plan, billingId, promoState.discount || 0);

  useEffect(() => {
    setPromoInput(promoState.code || '');
  }, [promoState.code]);

  return (
    <div className="pricing-checkout" role="dialog" aria-modal="true" aria-labelledby="pricing-checkout-title">
      <button className="pricing-checkout__backdrop" type="button" aria-label="Закрыть" onClick={onClose} />
      <section className="pricing-checkout__panel">
        <header>
          <div>
            <span>Оформление подписки</span>
            <h2 id="pricing-checkout-title">{plan.name}</h2>
          </div>
          <button type="button" className="pricing-checkout__close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="pricing-checkout__summary">
          <div><span>Период</span><strong>{BILLING_PERIODS[billingId].label}</strong></div>
          <div><span>Базовая стоимость</span><strong>{formatPrice(totals.subtotal)}</strong></div>
          {totals.billingDiscount > 0 ? <div className="is-discount"><span>Скидка за год</span><strong>−{formatPrice(totals.billingDiscount)}</strong></div> : null}
          {totals.promoValue > 0 ? <div className="is-discount"><span>Промокод</span><strong>−{formatPrice(totals.promoValue)}</strong></div> : null}
        </div>

        <div className="pricing-checkout__promo">
          <label htmlFor="pricing-promo">Промокод</label>
          <div>
            <input id="pricing-promo" value={promoInput} onChange={(event) => setPromoInput(event.target.value.toUpperCase())} placeholder="SHIELD10" />
            <button type="button" onClick={() => onPromo(promoInput)} disabled={promoState.loading}>{promoState.loading ? '...' : 'Применить'}</button>
          </div>
          {promoState.message ? <small className={promoState.valid ? 'is-success' : 'is-error'}>{promoState.message}</small> : null}
        </div>

        <div className="pricing-checkout__total">
          <span>Итого</span>
          <strong>{formatPrice(totals.total)}</strong>
          <small>{billingId === 'annual' ? 'за 12 месяцев' : 'за первый месяц'}</small>
        </div>

        {message ? <div className="pricing-checkout__message">{message}</div> : null}

        <button type="button" className="pricing-checkout__pay" onClick={() => onProceed(totals)} disabled={busy}>
          {busy ? 'Подготавливаем…' : (localStorage.getItem('token') ? 'Перейти к оплате' : 'Продолжить регистрацию')}
          <Arrow />
        </button>

        <p className="pricing-checkout__legal">Нажимая кнопку, вы соглашаетесь с условиями сервиса и политикой конфиденциальности. Реальное списание выполняется только подключённым платёжным провайдером.</p>
      </section>
    </div>
  );
}

function Builder({ open, values, onToggle, onClose, onSelect }) {
  const total = useMemo(() => BUILDER_OPTIONS.reduce((sum, [id, , price]) => sum + (values[id] ? price : 0), 0), [values]);
  const count = Object.values(values).filter(Boolean).length;

  if (!open) return null;
  return (
    <div className="pricing-builder" role="dialog" aria-modal="true" aria-labelledby="pricing-builder-title">
      <button type="button" className="pricing-builder__backdrop" aria-label="Закрыть" onClick={onClose} />
      <section className="pricing-builder__panel">
        <header>
          <div><span>Конструктор</span><h2 id="pricing-builder-title">Соберите свой набор</h2><p>Выберите только те инструменты, которые действительно нужны вашей команде.</p></div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="pricing-builder__body">
          <div className="pricing-builder__options">
            {BUILDER_OPTIONS.map(([id, label, price]) => (
              <button key={id} type="button" className={values[id] ? 'is-selected' : ''} onClick={() => onToggle(id)} aria-pressed={values[id]}>
                <span><strong>{label}</strong><small>+ {formatPrice(price)} / мес.</small></span>
                <i>{values[id] ? <Check /> : null}</i>
              </button>
            ))}
          </div>
          <aside>
            <span>Выбрано функций</span><strong>{count}</strong>
            <div><span>Расчётная стоимость</span><b>{formatPrice(total)}</b></div>
            <p>Индивидуальный набор перед оплатой подтверждает менеджер.</p>
            <button type="button" disabled={!count} onClick={() => onSelect(total)}>Оставить заявку <Arrow /></button>
          </aside>
        </div>
      </section>
    </div>
  );
}

export default function PricingWorkspace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [billingId, setBillingId] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [promoState, setPromoState] = useState({ code: '', loading: false, valid: false, discount: 0, message: '' });
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderValues, setBuilderValues] = useState(() => Object.fromEntries(BUILDER_OPTIONS.map(([id]) => [id, false])));
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');

  useEffect(() => {
    const checkoutId = searchParams.get('checkout');
    if (!checkoutId) return;
    const plan = PRICING_PLANS.find((item) => item.id === checkoutId);
    if (plan) setSelectedPlan(plan);
  }, [searchParams]);

  const openPlan = (plan) => {
    setSelectedPlan(plan);
    setCheckoutMessage('');
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

  const applyPromo = async (code) => {
    setPromoState((current) => ({ ...current, loading: true, message: '' }));
    try {
      const result = await pricingService.validatePromo(code);
      setPromoState({ code: String(code || '').trim().toUpperCase(), loading: false, valid: Boolean(result.valid), discount: result.discount || 0, message: result.message || '' });
    } catch {
      setPromoState({ code, loading: false, valid: false, discount: 0, message: 'Не удалось проверить промокод' });
    }
  };

  const proceed = async (totals) => {
    if (!selectedPlan) return;
    const payload = {
      planId: selectedPlan.id,
      billing: billingId,
      promo: promoState.valid ? promoState.code : null,
      amount: Math.round(totals.total),
      currency: 'RUB',
      returnUrl: `${window.location.origin}/pricing?checkout=${selectedPlan.id}`,
    };

    localStorage.setItem('selectedPlan', JSON.stringify({
      id: selectedPlan.id,
      title: selectedPlan.name,
      price: selectedPlan.monthlyPrice,
      billing: billingId,
      promo: promoState.valid ? promoState.code : null,
      total: Math.round(totals.total),
    }));

    if (!localStorage.getItem('token')) {
      navigate(`/auth?mode=register&next=${encodeURIComponent(`/pricing?checkout=${selectedPlan.id}`)}`);
      return;
    }

    setCheckoutBusy(true);
    setCheckoutMessage('');
    try {
      const result = await pricingService.createCheckout(payload);
      if (result.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }
      if (result.demo) {
        setCheckoutMessage('Демо-режим: платёжная сессия подготовлена. Подключите платёжного провайдера к POST /billing/checkout, чтобы выполнять реальные списания.');
      } else {
        setCheckoutMessage('Платёжная сессия создана. Ожидаем ссылку платёжного провайдера.');
      }
    } catch (error) {
      setCheckoutMessage(error?.message || 'Не удалось создать платёжную сессию');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const builderTotal = (total) => {
    localStorage.setItem('business-shield:custom-plan-draft', JSON.stringify({ options: builderValues, total, createdAt: new Date().toISOString() }));
    setBuilderOpen(false);
    navigate('/auth?mode=register&next=%2Fonboarding');
  };

  return (
    <main className="pricing-page">
      <header className="pricing-header">
        <Link className="pricing-header__brand" to="/" aria-label="Бизнес Щит — главная">
          <BrandMark size={42} />
          <span><strong>БИЗНЕС ЩИТ</strong><small>reputation operating system</small></span>
        </Link>
        <nav><Link to="/">Главная</Link><a href="#plans">Тарифы</a><button type="button" onClick={() => navigate('/auth?mode=login')}>Войти</button></nav>
      </header>

      <section className="pricing-hero">
        <div className="pricing-hero__glow" aria-hidden="true" />
        <span className="pricing-kicker"><i /> Прозрачные условия · без скрытых платежей</span>
        <h1>Выберите уровень<br/><em>спокойствия</em></h1>
        <p>Начните с готового тарифа или соберите свой. Все цены и условия видны до регистрации.</p>
        <div className="pricing-billing" role="group" aria-label="Период оплаты">
          {Object.values(BILLING_PERIODS).map((period) => (
            <button key={period.id} type="button" className={billingId === period.id ? 'is-active' : ''} onClick={() => setBillingId(period.id)}>
              {period.label}{period.discount ? <span>−15%</span> : null}
            </button>
          ))}
        </div>
        <div className="pricing-hero__trust"><span>14 дней на запуск</span><span>Поддержка 24/7</span><span>Отмена без звонка менеджеру</span></div>
      </section>

      <section className="pricing-section" id="plans">
        <div className="pricing-section__heading"><span>Тарифы</span><h2>Три щита. Один стандарт качества.</h2><p>Сравните не только цену, но и реальный объём работы команды.</p></div>
        <div className="pricing-grid">
          {PRICING_PLANS.map((plan) => <PlanCard key={plan.id} plan={plan} billingId={billingId} onSelect={openPlan} />)}
        </div>
      </section>

      <section className="pricing-custom">
        <div><span>Нужна другая конфигурация?</span><h2>Соберите подписку под свои процессы</h2><p>Подключите аналитику, дизайн, юристов, автоматизацию или персонального менеджера отдельно.</p></div>
        <button type="button" onClick={() => setBuilderOpen(true)}>Открыть конструктор <Arrow /></button>
      </section>

      <section className="pricing-security">
        <div><span className="pricing-security__icon">✓</span><strong>Платёжные данные не хранятся в Бизнес Щит</strong><p>Оплата должна проходить на стороне подключённого платёжного провайдера. Мы сохраняем только статус подписки и идентификатор платежа.</p></div>
        <div><span className="pricing-security__icon">↺</span><strong>Подпиской можно управлять из кабинета</strong><p>Продление, смена тарифа, история платежей и автопродление уже предусмотрены в личном кабинете.</p></div>
      </section>

      <footer className="pricing-footer"><BrandMark size={34} /><span>© 2026 Бизнес Щит</span><Link to="/">На главную</Link></footer>

      {selectedPlan ? <CheckoutPanel plan={selectedPlan} billingId={billingId} promoState={promoState} onClose={closeCheckout} onPromo={applyPromo} onProceed={proceed} busy={checkoutBusy} message={checkoutMessage} /> : null}
      <Builder open={builderOpen} values={builderValues} onToggle={(id) => setBuilderValues((current) => ({ ...current, [id]: !current[id] }))} onClose={() => setBuilderOpen(false)} onSelect={builderTotal} />
    </main>
  );
}
