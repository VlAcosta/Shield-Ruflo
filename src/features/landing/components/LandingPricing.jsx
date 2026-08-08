import React from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';
import { LANDING_PLANS } from '../model/landingData';

export default function LandingPricing() {
  const navigate = useNavigate();

  return (
    <section className="landing-section landing-pricing" id="pricing">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Выберите свой щит</span>
          <h2>Три уровня контроля. <span>Одна логика продукта.</span></h2>
          <p>Начните с мониторинга или подключите команду и расширенные сценарии — без смены рабочей среды.</p>
        </div>

        <div className="landing-pricing__grid">
          {LANDING_PLANS.map((plan, index) => (
            <article className={`landing-priceCard landing-priceCard--${plan.tone} ${plan.popular ? 'is-popular' : ''}`} key={plan.id} data-landing-reveal style={{ '--landing-delay': `${index * 90}ms` }}>
              {plan.popular ? <span className="landing-priceCard__popular"><LandingIcon name="star" size={14} /> популярный</span> : null}
              <div className="landing-priceCard__head">
                <span>{plan.label}</span>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
              </div>
              <div className="landing-priceCard__price"><strong>{plan.price}</strong><span>{plan.suffix}</span></div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}><LandingIcon name="checkCircle" size={17} /><span>{feature}</span></li>
                ))}
              </ul>
              <button className={`landing-btn ${plan.popular ? 'landing-btn--gradient' : 'landing-btn--soft'} landing-priceCard__button`} type="button" onClick={() => navigate('/pricing')}>
                Выбрать тариф
                <LandingIcon name="arrow" size={17} />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
