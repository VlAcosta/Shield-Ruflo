import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';

const MANAGED_SERVICE_CARDS = Object.freeze([
  { title: 'Managed Replies', text: 'Ответы специалистами продаются отдельным объёмным пакетом с понятным SLA, а не как безлимитная функция тарифа.', icon: 'message', tone: 'blue' },
  { title: 'Legal review', text: 'Юридический разбор подключается как отдельный retainer или scope сложного кейса.', icon: 'shield', tone: 'purple' },
  { title: 'Design / Content credits', text: 'Креативные задачи считаются по credits, часам или deliverables и не входят скрыто в SaaS COGS.', icon: 'palette', tone: 'pink' },
  { title: 'Reputation Strategy', text: 'Стратегия и QBR — отдельный сервисный слой для клиентов, которым нужен экспертный action plan.', icon: 'chart', tone: 'orange' },
]);

const STRATEGY_FAQ = Object.freeze([
  {
    category: 'Старт',
    question: 'Что должно произойти в первые 14 дней?',
    answer: 'Создайте организацию, подключите доступный production-ready источник, настройте response policy и SLA, получите первый review event и выполните первое действие. Trial должен довести до first value, а не показывать искусственный demo-режим.',
  },
  {
    category: 'Площадки',
    question: 'Какие площадки реально поддерживаются?',
    answer: 'Business Shield показывает capability отдельно для каждого provider. Read, reply и sync считаются доступными только после того, как production adapter установлен, настроен и подтверждает соответствующую capability. Planned-интеграция не выдаётся за рабочую.',
  },
  {
    category: 'Ответы',
    question: 'Можно ли согласовывать сложные ответы?',
    answer: 'Да, если текущий тариф и permission-контекст разрешают approval workflow. Команда может использовать AI draft, согласование и публикацию как отдельные этапы с историей действий.',
  },
  {
    category: 'Тарифы',
    question: 'Почему цена зависит не только от функций?',
    answer: 'План задаёт capability и governance, а масштаб измеряется locations, review volume, users, AI и automation usage. Человеческий труд — managed replies, legal, content или strategy — продаётся отдельно.',
  },
  {
    category: 'Лимиты',
    question: 'Что происходит при приближении к лимиту?',
    answer: 'Usage должен быть виден заранее с предупреждениями на 70%, 90% и 100%. Расширение ресурсов может требовать upgrade или add-on, но критический reply workflow не должен внезапно отключаться из-за месячного review/AI volume.',
  },
  {
    category: 'Безопасность',
    question: 'Решает ли интерфейс, к каким данным у меня есть доступ?',
    answer: 'Нет. Интерфейс только отображает доступ. Организация, роль, permission, entitlement и ownership ресурса проверяются серверным контуром.',
  },
]);

export function ServicesSection() {
  return (
    <section className="landing-section landing-services" id="managed-services">
      <div className="landing-shell">
        <div className="landing-sectionHead" data-landing-reveal>
          <span className="landing-kicker">Managed services · отдельно от SaaS</span>
          <h2>Экспертиза людей — <span>add-on, а не скрытый «безлимит».</span></h2>
          <p>Платформа отвечает за software workflow. Ручная работа имеет отдельный объём, SLA и capacity model.</p>
        </div>
        <div className="landing-services__grid">
          {MANAGED_SERVICE_CARDS.map((item, index) => (
            <article className={`landing-serviceCard landing-serviceCard--${item.tone}`} key={item.title} data-landing-reveal style={{ '--landing-delay': `${index * 70}ms` }}>
              <span className="landing-serviceCard__icon"><LandingIcon name={item.icon} size={21} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);
  const opened = openIndex >= 0 ? STRATEGY_FAQ[openIndex] : null;

  return (
    <section className="landing-section landing-faq" id="faq">
      <div className="landing-faq__ambient" aria-hidden="true"><i /><i /></div>
      <div className="landing-shell landing-faq__grid">
        <div className="landing-faq__copy" data-landing-reveal>
          <span className="landing-kicker">Частые вопросы</span>
          <h2>Что платформа обещает — <span>и где проходит граница.</span></h2>
          <p>Ответы про first value, provider capabilities, тарифы, лимиты и серверный контроль доступа.</p>

          <div className="landing-faq__meta" aria-label="Разделы частых вопросов">
            <span><strong>{STRATEGY_FAQ.length}</strong> вопросов</span>
            <span><i /> product truth</span>
            <span><i /> billing</span>
            <span><i /> security</span>
          </div>

          <a className="landing-faq__support" href="#contact">
            <span className="landing-faq__supportIcon"><LandingIcon name="message" size={21} /></span>
            <div><strong>Нужен другой сценарий?</strong><span>Оставьте заявку — отдельно обсудим locations, sources, volume, API и SLA.</span></div>
            <LandingIcon name="arrow" size={16} className="landing-faq__supportArrow" />
          </a>
        </div>

        <div className="landing-faq__panel" data-landing-reveal>
          <div className="landing-faq__panelHead">
            <div>
              <span>FAQ / {String(STRATEGY_FAQ.length).padStart(2, '0')}</span>
              <strong>{opened?.category || 'Выберите вопрос'}</strong>
            </div>
            <span className="landing-faq__panelStatus"><i /> Product truth</span>
          </div>

          <div className="landing-faq__list">
            {STRATEGY_FAQ.map((item, index) => {
              const isOpen = openIndex === index;
              const answerId = `landing-faq-answer-${index}`;
              const buttonId = `landing-faq-button-${index}`;

              return (
                <article className={`landing-faqItem ${isOpen ? 'is-open' : ''}`} key={item.question} style={{ '--faq-delay': `${index * 38}ms` }}>
                  <button id={buttonId} type="button" onClick={() => setOpenIndex(isOpen ? -1 : index)} aria-expanded={isOpen} aria-controls={answerId}>
                    <span className="landing-faqItem__index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="landing-faqItem__question"><small>{item.category}</small><strong>{item.question}</strong></span>
                    <i className="landing-faqItem__toggle" aria-hidden="true"><span /></i>
                  </button>
                  <div id={answerId} className="landing-faqItem__answer" role="region" aria-labelledby={buttonId} aria-hidden={!isOpen}>
                    <div><span className="landing-faqItem__answerMark"><LandingIcon name="checkCircle" size={17} /></span><p>{item.answer}</p></div>
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
          <span className="landing-kicker landing-kicker--light">Первый результат — не через месяцы</span>
          <h2>Подключите источник. Настройте SLA. <span>Закройте первый reputation event.</span></h2>
          <p>Trial строится вокруг first value: реальное событие, действие команды и понятный следующий шаг.</p>
        </div>
        <div className="landing-finalCta__actions">
          <div className="landing-finalCta__chips">
            <span><LandingIcon name="checkCircle" size={16} /> 14-дневный trial</span>
            <span><LandingIcon name="checkCircle" size={16} /> Capability-aware sources</span>
            <span><LandingIcon name="checkCircle" size={16} /> SLA & approval workflow</span>
            <span><LandingIcon name="checkCircle" size={16} /> Прозрачные usage limits</span>
          </div>
          <div className="landing-finalCta__buttons">
            <button className="landing-btn landing-btn--light landing-btn--large" type="button" onClick={() => navigate('/pricing')}>Посмотреть тарифы <LandingIcon name="arrow" size={18} /></button>
            <button className="landing-btn landing-btn--glass landing-btn--large" type="button" onClick={() => navigate('/auth?mode=login')}>Войти в кабинет</button>
          </div>
        </div>
      </div>
    </section>
  );
}
