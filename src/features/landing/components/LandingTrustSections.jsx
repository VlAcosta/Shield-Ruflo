import React from 'react';
import LandingIcon from './LandingIcon';
import {
  LANDING_ADVANTAGES,
  LANDING_CASES,
  LANDING_INDUSTRIES,
} from '../model/landingData';
import restaurantCase from '../../../assets/main-site/photo6_1.webp';
import autoserviceCase from '../../../assets/main-site/phote6_2.webp';

const CASE_IMAGES = {
  restaurant: restaurantCase,
  autoservice: autoserviceCase,
};

export function AdvantagesSection() {
  return (
    <section className="landing-section landing-advantages">
      <div className="landing-shell">
        <div className="landing-advantages__head" data-landing-reveal>
          <div>
            <span className="landing-kicker landing-kicker--light">Почему выбирают нас</span>
            <h2>Не подрядчик на одну задачу. <span>Система и команда рядом.</span></h2>
          </div>
          <p>Мы собираем в одном контуре то, что обычно приходится распределять между несколькими сервисами и специалистами.</p>
        </div>

        <div className="landing-advantages__grid">
          {LANDING_ADVANTAGES.map((item, index) => (
            <article className="landing-advantageCard" key={item.title} data-landing-reveal style={{ '--landing-delay': `${index * 55}ms` }}>
              <span className="landing-advantageCard__icon"><LandingIcon name={item.icon} size={20} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>

        <div className="landing-advantages__metrics" data-landing-reveal>
          <div><strong>500+</strong><span>клиентов</span></div>
          <div><strong>10k+</strong><span>отзывов обработано</span></div>
          <div><strong>98%</strong><span>положительных кейсов</span></div>
          <div><strong>2ч</strong><span>среднее время реакции</span></div>
        </div>
      </div>
    </section>
  );
}

export function TeamSection() {
  return (
    <section className="landing-section landing-team">
      <div className="landing-shell">
        <div className="landing-team__panel" data-landing-reveal>
          <div className="landing-team__avatars" aria-hidden="true">
            <div className="landing-team__avatar is-one">Ю</div>
            <div className="landing-team__avatar is-two">М</div>
            <div className="landing-team__avatar is-three">Д</div>
            <div className="landing-team__avatar is-four">А</div>
            <span>+34</span>
          </div>

          <div className="landing-team__copy">
            <span className="landing-kicker">Команда</span>
            <h2>Профессионалы на вашей стороне <span>24/7</span></h2>
            <p>Юристы, маркетологи, дизайнеры и специалисты по репутации работают в одном процессе — без бесконечной передачи задач между подрядчиками.</p>
          </div>

          <div className="landing-team__metrics">
            <div><strong>5+</strong><span>лет опыта</span></div>
            <div><strong>38</strong><span>человек в команде</span></div>
            <div><strong>24/7</strong><span>поддержка</span></div>
            <div><strong>10k+</strong><span>отзывов</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CasesSection() {
  return (
    <section className="landing-section landing-cases" id="cases">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Кейсы</span>
          <h2>Реальные результаты. <span>Проверенные методы.</span></h2>
          <p>Два типовых сценария из продуктовой логики: рост рейтинга и защита от недостоверного негатива.</p>
        </div>

        <div className="landing-cases__list">
          {LANDING_CASES.map((item, index) => (
            <article className={`landing-case landing-case--${item.tone} ${index % 2 ? 'is-reverse' : ''}`} key={item.id} data-landing-reveal>
              <div className="landing-case__media">
                <img src={CASE_IMAGES[item.image]} alt="" loading="lazy" decoding="async" />
                <span className="landing-case__mediaBadge">CASE {String(index + 1).padStart(2, '0')}</span>
              </div>

              <div className="landing-case__content">
                <span className="landing-case__eyebrow">{item.eyebrow}</span>
                <h3>{item.title}</h3>
                <div className="landing-case__textBlock">
                  <strong>Задача</strong>
                  <p>{item.problem}</p>
                </div>
                <div className="landing-case__textBlock">
                  <strong>Что сделали</strong>
                  <p>{item.solution}</p>
                </div>
                <div className="landing-case__metrics">
                  {item.metrics.map(([value, label]) => (
                    <div key={label}><strong>{value}</strong><span>{label}</span></div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="landing-cases__cta" data-landing-reveal>
          <div><span>Хотите стать следующим кейсом?</span><strong>Начнём с короткого аудита и карты рисков.</strong></div>
          <a className="landing-btn landing-btn--gradient" href="#contact">Получить аудит <LandingIcon name="arrow" size={18} /></a>
        </div>
      </div>
    </section>
  );
}

export function IndustriesSection() {
  return (
    <section className="landing-section landing-industries">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Отрасли</span>
          <h2>Работаем с бизнесом, где <span>доверие влияет на выбор.</span></h2>
          <p>Сценарии продукта адаптируются под локальный бизнес, услуги, e-commerce, B2B и личный бренд.</p>
        </div>

        <div className="landing-industries__cloud" data-landing-reveal aria-label="Отрасли, с которыми работает Бизнес Щит">
          {LANDING_INDUSTRIES.map((industry, index) => (
            <button
              type="button"
              key={industry}
              className={index % 5 === 0 ? 'is-accent' : ''}
              style={{ '--industry-delay': `${index * 38}ms` }}
            >
              <span>{industry}</span>
            </button>
          ))}
        </div>

        <div className="landing-industries__note" data-landing-reveal>
          <span className="landing-industries__noteDot" aria-hidden="true" />
          <p>Не нашли свою сферу? Начните с пакета или конструктора — сценарий можно собрать под ваш процесс.</p>
        </div>
      </div>
    </section>
  );
}
