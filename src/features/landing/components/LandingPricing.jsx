import React from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';
import { PRICING_PLANS, formatPrice } from '../../pricing/model/pricingData';

const PLAN_TONES = Object.freeze({
  START: 'blue',
  GROWTH: 'purple',
  PRO: 'pink',
  BUSINESS: 'blue',
});

export default function LandingPricing() {
  const navigate = useNavigate();

  return (
    <section className="landing-section landing-pricing" id="pricing">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Выберите свой щит</span>
          <h2>Четыре уровня контроля. <span>Одна логика продукта.</span></h2>
          <p>Выберите тариф по количеству точек, объёму отзывов и уровню командного контроля. При годовой оплате действует скидка 15%.</p>
        </div>

        <div className="landing-pricing__grid">
          {PRICING_PLANS.map((plan, index) => {
            const displayPrice = `${plan.pricePrefix ? `${plan.pricePrefix} ` : ''}${formatPrice(plan.monthlyPrice)}`;
            const features = plan.outcomes.slice(0, 5);

            return (
              <article
                className={`landing-priceCard landing-priceCard--${PLAN_TONES[plan.id] || 'blue'} ${plan.popular ? 'is-popular' : ''}`}
                key={plan.id}
                data-landing-reveal
                style={{ '--landing-delay': `${index * 90}ms` }}
              >
                {plan.popular ? <span className="landing-priceCard__popular"><LandingIcon name="star" size={14} /> популярный</span> : null}
                <div className="landing-priceCard__head">
                  <span>{plan.eyebrow}</span>
                  <h3>{plan.name}</h3>
                  <p>{plan.description}</p>
                </div>
                <div className="landing-priceCard__price"><strong>{displayPrice}</strong><span>/ мес</span></div>
                <ul>
                  {features.map((feature) => (
                    <li key={feature}><LandingIcon name="checkCircle" size={17} /><span>{feature}</span></li>
                  ))}
                </ul>
                <button
                  className={`landing-btn ${plan.popular ? 'landing-btn--gradient' : 'landing-btn--soft'} landing-priceCard__button`}
                  type="button"
                  onClick={() => navigate('/pricing')}
                >
                  {plan.contactSales ? 'Обсудить условия' : 'Выбрать тариф'}
                  <LandingIcon name="arrow" size={17} />
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
