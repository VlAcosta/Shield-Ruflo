import React from 'react';
import LandingIcon from './LandingIcon';
import {
  CORE_CAPABILITIES,
  REPUTATION_LOOP,
  REPUTATION_PROBLEMS,
} from '../model/landingStrategyData';

export function ProblemsSection() {
  return (
    <section className="landing-section landing-problems" id="problems">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Знакомые проблемы</span>
          <h2>Репутация складывается <span>из каждого отзыва.</span></h2>
          <p>Важно вовремя замечать обратную связь, отвечать клиентам и устранять причины жалоб.</p>
        </div>

        <div className="landing-problems__grid">
          {REPUTATION_PROBLEMS.map((problem, index) => (
            <article className={`landing-problemCard landing-problemCard--${problem.accent}`} key={problem.title} data-landing-reveal style={{ '--landing-delay': `${index * 70}ms` }}>
              <div className="landing-problemCard__top">
                <span>{problem.number}</span>
                <i />
              </div>
              <span className="landing-problemCard__icon" aria-hidden="true">
                <LandingIcon name={problem.icon || 'shield'} size={22} />
              </span>
              <div className="landing-problemCard__content">
                <h3>{problem.title}</h3>
                <p>{problem.text}</p>
              </div>
              <div className="landing-problemCard__signal">
                <span className="landing-problemCard__signalDot" />
                <span>требует внимания</span>
              </div>
            </article>
          ))}
        </div>

        <div className="landing-problems__shield" data-landing-reveal>
          <div className="landing-problems__shieldIcon"><LandingIcon name="shield" size={24} /></div>
          <div>
            <strong>Мы — ваш щит.</strong>
            <span>Помогаем заметить отзыв, подготовить ответ и довести работу с жалобой до результата.</span>
          </div>
          <a href="#process">Как это работает <LandingIcon name="arrow" size={17} /></a>
        </div>
      </div>
    </section>
  );
}

export function ProcessSection() {
  return (
    <section className="landing-section landing-process" id="process">
      <div className="landing-shell">
        <div className="landing-sectionHead" data-landing-reveal>
          <span className="landing-kicker">Как это работает</span>
          <h2>Простой процесс. <span>Постоянный контроль.</span></h2>
          <p>Каждый этап отвечает на отдельный вопрос: что произошло, насколько срочно, как ответить, кто согласует, что исправить и изменился ли результат.</p>
        </div>

        <div className="landing-process__steps">
          {REPUTATION_LOOP.map((step, index) => (
            <article className={`landing-processStep landing-processStep--${step.tone}`} key={step.number} data-landing-reveal style={{ '--landing-delay': `${index * 55}ms` }}>
              <div className="landing-processStep__number">{step.number}</div>
              <div className="landing-processStep__line" />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>

        <div className="landing-monitorPanel" data-landing-reveal>
          <div className="landing-monitorPanel__copy">
            <span className="landing-monitorPanel__live"><i /> Подключение площадок</span>
            <h3>Отзывы с разных площадок — в одном кабинете.</h3>
            <p>Перед подключением проверьте доступные действия: на одних площадках можно получать отзывы, на других — ещё и публиковать ответы.</p>
            <div className="landing-monitorPanel__sources">
              <div><LandingIcon name="checkCircle" size={17} /><span>Сбор отзывов с подключённых площадок</span></div>
              <div><LandingIcon name="checkCircle" size={17} /><span>Публикация ответов там, где она поддерживается</span></div>
              <div><LandingIcon name="checkCircle" size={17} /><span>Статус подключения и обновления данных</span></div>
            </div>
          </div>

          <div className="landing-monitorPanel__visual" aria-hidden="true">
            <div className="landing-radar">
              <span className="landing-radar__ring landing-radar__ring--1" />
              <span className="landing-radar__ring landing-radar__ring--2" />
              <span className="landing-radar__ring landing-radar__ring--3" />
              <span className="landing-radar__sweep" />
              <span className="landing-radar__center"><LandingIcon name="shield" size={30} /></span>
              <i className="landing-radar__point landing-radar__point--1" />
              <i className="landing-radar__point landing-radar__point--2" />
              <i className="landing-radar__point landing-radar__point--3" />
            </div>
            <div className="landing-monitorPanel__badge is-one"><strong>Отзывы</strong><span>сбор</span></div>
            <div className="landing-monitorPanel__badge is-two"><strong>Ответы</strong><span>публикация</span></div>
            <div className="landing-monitorPanel__badge is-three"><strong>Статус</strong><span>подключение</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CapabilitiesSection() {
  return (
    <section className="landing-section landing-capabilities" id="capabilities">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Возможности</span>
          <h2>Всё для работы с отзывами. <span>В одном месте.</span></h2>
          <p>От первого отзыва до отчёта руководителю: каждый участник команды видит свои задачи и следующий шаг.</p>
        </div>

        <div className="landing-capabilities__grid">
          {CORE_CAPABILITIES.map((item, index) => (
            <article className="landing-capabilityCard" key={item.key} data-landing-reveal style={{ '--landing-delay': `${(index % 4) * 55}ms` }}>
              <span className={`landing-capabilityCard__icon is-${index % 4}`}><LandingIcon name={item.icon} size={21} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="landing-capabilityCard__index">{String(index + 1).padStart(2, '0')}</span>
            </article>
          ))}
        </div>

        <div className="landing-capabilities__more" data-landing-reveal>
          <span>Дополнительные услуги</span>
          <strong>Работа специалистов оплачивается отдельно от подписки.</strong>
        </div>
      </div>
    </section>
  );
}
