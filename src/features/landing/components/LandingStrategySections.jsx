import React from 'react';
import LandingIcon from './LandingIcon';
import { ICP_SEGMENTS, PRODUCT_KPIS, PRODUCT_TRUTHS } from '../model/landingStrategyData';
import './LandingStrategySections.scss';

export function ProductTruthSection() {
  return (
    <section className="landing-section landing-strategyTruth" id="product-truth">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Product truth</span>
          <h2>Публичное обещание должно совпадать <span>с тем, что контролирует backend.</span></h2>
          <p>Никаких «доступно» из-за одной карточки в интерфейсе. Права, provider capabilities, usage и workflow подтверждаются серверным контуром.</p>
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
          <span className="landing-kicker">Кому продукт даёт first value быстрее всего</span>
          <h2>Три стартовых сегмента. <span>Не пятнадцать одинаковых обещаний.</span></h2>
          <p>Технологически платформа может расширяться, но go-to-market начинается там, где closed-loop reputation workflow решает понятную ежедневную боль.</p>
        </div>
        <div className="landing-marketFocus__grid">
          {ICP_SEGMENTS.map((segment, index) => (
            <article key={segment.id} className="landing-marketFocus__card" data-landing-reveal style={{ '--landing-delay': `${index * 70}ms` }}>
              <div className="landing-marketFocus__top">
                <span>{segment.priority}</span>
                <b>0{index + 1}</b>
              </div>
              <h3>{segment.title}</h3>
              <div><strong>Боль</strong><p>{segment.pain}</p></div>
              <div><strong>Почему подходит Business Shield</strong><p>{segment.fit}</p></div>
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
          <span className="landing-kicker landing-kicker--light">Как измеряем ценность</span>
          <h2>Не «сколько экранов открыли». <span>Насколько управляемо закрывается негатив.</span></h2>
          <p>Пока нет публично подтверждённых case studies, мы не подменяем доказательства красивыми процентами. Продукт измеряет конкретные операционные KPI.</p>
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
