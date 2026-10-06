import React from 'react';
import LandingIcon from './LandingIcon';
import { ICP_SEGMENTS, PRODUCT_KPIS, PRODUCT_TRUTHS } from '../model/landingStrategyData';
import './LandingStrategySections.scss';

export function ProductTruthSection() {
  return (
    <section className="landing-section landing-strategyTruth" id="product-truth">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Почему Бизнес Щит</span>
          <h2>Понятные правила. <span>Контроль в ваших руках.</span></h2>
          <p>Настраивайте доступ сотрудников, следите за действиями команды и выбирайте подходящий объём работы.</p>
        </div>
        <div className="landing-strategyTruth__grid">
          {PRODUCT_TRUTHS.map((item, index) => (
            <article key={item.title} className="landing-strategyTruth__card" data-landing-reveal style={{ '--landing-delay': `${index * 60}ms` }}>
              <span><LandingIcon name={item.icon} size={21} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketFocusSection() {
  return (
    <section className="landing-section landing-marketFocus" id="segments">
      <div className="landing-shell">
        <div className="landing-sectionHead" data-landing-reveal>
          <span className="landing-kicker">Кому подходит</span>
          <h2>Для бизнеса, где <span>доверие влияет на выбор.</span></h2>
          <p>Кафе, салоны, магазины, сервисные компании и сети — у каждого бизнеса свои задачи, а потребность слышать клиентов общая.</p>
        </div>
        <div className="landing-marketFocus__grid">
          {ICP_SEGMENTS.map((segment, index) => (
            <article key={segment.id} id={`segment-${segment.id}`} className="landing-marketFocus__card" data-landing-reveal style={{ '--landing-delay': `${index * 70}ms` }}>
              <div className="landing-marketFocus__top">
                <span>{segment.priority}</span>
                <b>0{index + 1}</b>
              </div>
              <h3>{segment.title}</h3>
              <div><strong>Задача</strong><p>{segment.pain}</p></div>
              <div><strong>Как помогает Бизнес Щит</strong><p>{segment.fit}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OutcomeMetricsSection() {
  return (
    <section className="landing-section landing-outcomeMetrics" id="measurement">
      <div className="landing-shell landing-outcomeMetrics__panel" data-landing-reveal>
        <div className="landing-outcomeMetrics__copy">
          <span className="landing-kicker landing-kicker--light">Результаты работы</span>
          <h2>Понимайте, что меняется. <span>Принимайте решения по данным.</span></h2>
          <p>Следите за скоростью работы команды, ответами на отзывы и изменениями рейтинга. Показатели помогают увидеть, где нужно больше внимания.</p>
        </div>
        <div className="landing-outcomeMetrics__grid">
          {PRODUCT_KPIS.map((metric, index) => (
            <div key={metric.title} className="landing-outcomeMetrics__item">
              <span>0{index + 1}</span>
              <strong>{metric.title}</strong>
              <p>{metric.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
