import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';

const MANAGED_SERVICE_CARDS = Object.freeze([
  { title: 'Ответы на отзывы', text: 'Подготовка ответов специалистами. Количество отзывов и сроки работы согласовываются отдельно.', icon: 'message', tone: 'blue' },
  { title: 'Юридическая помощь', text: 'Разбор спорных отзывов и сложных обращений. Стоимость зависит от задачи и объёма работы.', icon: 'shield', tone: 'purple' },
  { title: 'Дизайн и тексты', text: 'Материалы для вашего бизнеса: тексты, баннеры и оформление. Объём и стоимость согласовываются до начала работы.', icon: 'palette', tone: 'pink' },
  { title: 'Стратегия репутации', text: 'Разбор текущей ситуации и план действий для работы с репутацией вашего бизнеса.', icon: 'chart', tone: 'orange' },
]);

const STRATEGY_FAQ = Object.freeze([
  {
    category: 'Старт',
    question: 'Можно начать без сложной настройки?',
    answer: 'Начните с выбора тарифа и создания организации. Затем подключите доступную площадку, добавьте сотрудников и определите, кто отвечает на отзывы. Возможности подключения можно проверить в кабинете.',
  },
  {
    category: 'Площадки',
    question: 'С какими площадками работает система?',
    answer: 'Список площадок и доступных действий можно посмотреть в разделе подключений. Сбор отзывов и публикация ответов поддерживаются не на всех площадках одинаково. Перед началом работы проверьте возможности и статус выбранного подключения.',
  },
  {
    category: 'Ответы',
    question: 'Можно работать командой и согласовывать ответы?',
    answer: 'Да. Сотрудникам можно назначать роли и права доступа. Если согласование включено в тариф, подготовленный ответ передаётся на проверку перед публикацией. Действия команды сохраняются в истории.',
  },
  {
    category: 'Тарифы',
    question: 'Чем отличаются тарифы?',
    answer: 'Тарифы отличаются инструментами, количеством точек и сотрудников, объёмом отзывов и использования ИИ. Подробные лимиты указаны на странице тарифов. Ответы специалистами, юридическая помощь, дизайн и тексты оплачиваются отдельно.',
  },
  {
    category: 'Лимиты',
    question: 'Где посмотреть лимиты тарифа?',
    answer: 'До выбора подписки сравните лимиты на странице тарифов. В кабинете можно проверить условия своего плана и использование ресурсов. Если объёма недостаточно, уточните возможность расширения или выберите другой тариф.',
  },
  {
    category: 'Безопасность',
    question: 'Кто может видеть данные моей компании?',
    answer: 'Доступ зависит от организации, роли сотрудника и выданных ему разрешений. Сотрудники других организаций не получают доступ к вашим данным. Проверка прав выполняется при каждом запросе к данным.',
  },
]);

export function ServicesSection() {
  return (
    <section className="landing-section landing-services" id="managed-services">
      <div className="landing-shell">
        <div className="landing-sectionHead" data-landing-reveal>
          <span className="landing-kicker">Дополнительные услуги</span>
          <h2>Нужна помощь специалистов? <span>Обсудим вашу задачу.</span></h2>
          <p>Услуги специалистов не входят в подписку. Возможность выполнения, объём, сроки и стоимость согласовываются отдельно.</p>
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
          <h2>Коротко. По делу. <span>Без мелкого шрифта.</span></h2>
          <p>Как начать работу, подключить площадки, выбрать тариф и организовать работу команды.</p>

          <div className="landing-faq__meta" aria-label="Разделы частых вопросов">
            <span><strong>{STRATEGY_FAQ.length}</strong> вопросов</span>
            <span><i /> подключения</span>
            <span><i /> тарифы</span>
            <span><i /> доступ</span>
          </div>

          <a className="landing-faq__support" href="#pricing">
            <span className="landing-faq__supportIcon"><LandingIcon name="message" size={21} /></span>
            <div><strong>Какой тариф подойдёт?</strong><span>Сравните возможности и выберите подходящий объём работы.</span></div>
            <LandingIcon name="arrow" size={16} className="landing-faq__supportArrow" />
          </a>
        </div>

        <div className="landing-faq__panel" data-landing-reveal>
          <div className="landing-faq__panelHead">
            <div>
              <span>ВОПРОСЫ / {String(STRATEGY_FAQ.length).padStart(2, '0')}</span>
              <strong>{opened?.category || 'Выберите вопрос'}</strong>
            </div>
            <span className="landing-faq__panelStatus"><i /> О сервисе</span>
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
          <span className="landing-kicker landing-kicker--light">Начните с первого шага</span>
          <h2>Работайте спокойно. <span>Репутацию держим под контролем.</span></h2>
          <p>Выберите тариф, подключите площадку и начните работать с отзывами вместе с командой.</p>
        </div>
        <div className="landing-finalCta__actions">
          <div className="landing-finalCta__chips">
            <span><LandingIcon name="checkCircle" size={16} /> Выбор тарифа под ваши задачи</span>
            <span><LandingIcon name="checkCircle" size={16} /> Подключение площадок</span>
            <span><LandingIcon name="checkCircle" size={16} /> Контроль ответов команды</span>
            <span><LandingIcon name="checkCircle" size={16} /> Понятные лимиты</span>
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
