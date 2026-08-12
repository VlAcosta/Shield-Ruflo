import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';
import { LANDING_FAQ, LANDING_SERVICES } from '../model/landingData';
import promoImage from '../../../assets/main-site/promo.png';

export function ServicesSection() {
  return (
    <section className="landing-section landing-services">
      <div className="landing-shell">
        <div className="landing-sectionHead" data-landing-reveal>
          <span className="landing-kicker">Дополнительные услуги</span>
          <h2>Полный арсенал. <span>Не только репутация.</span></h2>
          <p>Если бренду нужен контент, дизайн или специалист — не приходится собирать новую цепочку подрядчиков.</p>
        </div>

        <div className="landing-services__grid">
          {LANDING_SERVICES.map((item, index) => (
            <article className={`landing-serviceCard landing-serviceCard--${item.tone}`} key={item.title} data-landing-reveal style={{ '--landing-delay': `${index * 70}ms` }}>
              <span className="landing-serviceCard__icon"><LandingIcon name={item.icon} size={21} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="landing-serviceCard__arrow"><LandingIcon name="arrow" size={17} /></span>
            </article>
          ))}
        </div>

        <div className="landing-promo" data-landing-reveal>
          <div className="landing-promo__copy">
            <span>CREATIVE LAB</span>
            <h3>Креативный дизайн для вашего бренда</h3>
            <p>От карточек и баннеров до фирменных материалов — визуальная коммуникация внутри той же экосистемы.</p>
            <a className="landing-btn landing-btn--light landing-promo__cta" href="#contact">
              <span>Обсудить проект</span>
              <LandingIcon name="arrow" size={17} />
            </a>
          </div>
          <div className="landing-promo__image" aria-hidden="true">
            <img src={promoImage} alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);
  const opened = openIndex >= 0 ? LANDING_FAQ[openIndex] : null;

  return (
    <section className="landing-section landing-faq" id="faq">
      <div className="landing-faq__ambient" aria-hidden="true"><i /><i /></div>
      <div className="landing-shell landing-faq__grid">
        <div className="landing-faq__copy" data-landing-reveal>
          <span className="landing-kicker">Частые вопросы</span>
          <h2>Коротко. По делу. <span>Без мелкого шрифта.</span></h2>
          <p>Собрали ответы про запуск, отзывы, аналитику и работу команды. Если сценарий сложнее — разберём его отдельно.</p>

          <div className="landing-faq__meta" aria-label="Разделы частых вопросов">
            <span><strong>{LANDING_FAQ.length}</strong> вопросов</span>
            <span><i /> продукт</span>
            <span><i /> команда</span>
            <span><i /> аналитика</span>
          </div>

          <a className="landing-faq__support" href="#contact">
            <span className="landing-faq__supportIcon"><LandingIcon name="message" size={21} /></span>
            <div><strong>Не нашли ответ?</strong><span>Оставьте заявку — разберём ваш сценарий отдельно.</span></div>
            <LandingIcon name="arrow" size={16} className="landing-faq__supportArrow" />
          </a>
        </div>

        <div className="landing-faq__panel" data-landing-reveal>
          <div className="landing-faq__panelHead">
            <div>
              <span>FAQ / {String(LANDING_FAQ.length).padStart(2, '0')}</span>
              <strong>{opened?.category || 'Выберите вопрос'}</strong>
            </div>
            <span className="landing-faq__panelStatus"><i /> Ответы по продукту</span>
          </div>

          <div className="landing-faq__list">
            {LANDING_FAQ.map((item, index) => {
              const isOpen = openIndex === index;
              const answerId = `landing-faq-answer-${index}`;
              const buttonId = `landing-faq-button-${index}`;

              return (
                <article
                  className={`landing-faqItem ${isOpen ? 'is-open' : ''}`}
                  key={item.question}
                  style={{ '--faq-delay': `${index * 38}ms` }}
                >
                  <button
                    id={buttonId}
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? -1 : index)}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                  >
                    <span className="landing-faqItem__index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="landing-faqItem__question">
                      <small>{item.category}</small>
                      <strong>{item.question}</strong>
                    </span>
                    <i className="landing-faqItem__toggle" aria-hidden="true"><span /></i>
                  </button>
                  <div
                    id={answerId}
                    className="landing-faqItem__answer"
                    role="region"
                    aria-labelledby={buttonId}
                    aria-hidden={!isOpen}
                  >
                    <div>
                      <span className="landing-faqItem__answerMark"><LandingIcon name="checkCircle" size={17} /></span>
                      <p>{item.answer}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCtaSection() {
  const navigate = useNavigate();

  return (
    <section className="landing-finalCta" id="contact">
      <div className="landing-finalCta__glow landing-finalCta__glow--one" />
      <div className="landing-finalCta__glow landing-finalCta__glow--two" />
      <div className="landing-shell landing-finalCta__inner" data-landing-reveal>
        <div>
          <span className="landing-kicker landing-kicker--light">Готовы начать?</span>
          <h2>Работайте спокойно. <span>Репутацию держим под контролем.</span></h2>
          <p>Понятный кабинет, специалисты на связи и запуск без долгого внедрения.</p>
        </div>
        <div className="landing-finalCta__actions">
          <div className="landing-finalCta__chips">
            <span><LandingIcon name="checkCircle" size={16} /> Интуитивный интерфейс</span>
            <span><LandingIcon name="checkCircle" size={16} /> Поддержка 24/7</span>
            <span><LandingIcon name="checkCircle" size={16} /> Быстрый запуск</span>
            <span><LandingIcon name="checkCircle" size={16} /> Прозрачные тарифы</span>
          </div>
          <div className="landing-finalCta__buttons">
            <button className="landing-btn landing-btn--light landing-btn--large" type="button" onClick={() => navigate('/pricing')}>Начать <LandingIcon name="arrow" size={18} /></button>
            <button className="landing-btn landing-btn--glass landing-btn--large" type="button" onClick={() => navigate('/auth')}>Войти в кабинет</button>
          </div>
        </div>
      </div>
    </section>
  );
}
