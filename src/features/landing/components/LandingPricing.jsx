import React from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';
import { LANDING_PLAN_SUMMARY } from '../model/landingStrategyData';

const PLAN_TONES = Object.freeze({
  START: 'blue',
  GROWTH: 'purple',
  PRO: 'pink',
  BUSINESS: 'blue',
});

export default function LandingPricing() {
  const navigate = useNavigate();

  return (
    <section className="landing-section landing-pricing landing-pricing--strategy" id="pricing">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">4 SaaS-тарифа</span>
          <h2>Цена растёт вместе с <span>locations, usage и governance.</span></h2>
          <p>Start — вход в систему. Growth — основной outcome-пакет. Pro — governance для сетей. Business — multi-location/agency и индивидуальный integration scope. Человеческие услуги подключаются отдельно.</p>
        </div>

        <div className="landing-pricing__grid">
          {LANDING_PLAN_SUMMARY.map((plan, index) => (
            <article className={`landing-priceCard landing-priceCard--${PLAN_TONES[plan.id]} ${plan.recommended ? 'is-popular' : ''}`} key={plan.id} data-landing-reveal style={{ '--landing-delay': `${index * 70}ms` }}>
              {plan.recommended ? <span className="landing-priceCard__popular"><LandingIcon name="star" size={14} /> рекомендуем</span> : null}
              <div className="landing-priceCard__head">
                <span>{plan.scope}</span>
                <h3>{plan.name}</h3>
                <p>{plan.note}</p>
              </div>
              <div className="landing-priceCard__price"><strong>{plan.price}</strong><span>/ мес</span></div>
              <ul>
                <li><LandingIcon name="checkCircle" size={17} /><span>−15% при годовой предоплате</span></li>
                <li><LandingIcon name="checkCircle" size={17} /><span>Явные лимиты locations / reviews / users / AI</span></li>
                <li><LandingIcon name="checkCircle" size={17} /><span>Managed services — отдельный add-on</span></li>
              </ul>
              <button className={`landing-btn ${plan.recommended ? 'landing-btn--gradient' : 'landing-btn--soft'} landing-priceCard__button`} type="button" onClick={() => navigate('/pricing')}>
                {plan.id === 'BUSINESS' ? 'Обсудить условия' : 'Посмотреть лимиты'}
                <LandingIcon name="arrow" size={17} />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
