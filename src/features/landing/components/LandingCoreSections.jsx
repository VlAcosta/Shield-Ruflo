import React from 'react';
import LandingIcon from './LandingIcon';
import {
  LANDING_CAPABILITIES,
  LANDING_PLATFORMS,
  LANDING_PROBLEMS,
  LANDING_STEPS,
} from '../model/landingData';

export function ProblemsSection() {
  return (
    <section className="landing-section landing-problems" id="problems">
      <div className="landing-shell">
        <div className="landing-sectionHead landing-sectionHead--center" data-landing-reveal>
          <span className="landing-kicker">Знакомая ситуация?</span>
          <h2>Репутационные риски редко выглядят большими — <span>пока не начинают стоить клиентов.</span></h2>
          <p>Мы собрали самые частые точки, где бизнес теряет доверие, скорость реакции и контроль.</p>
        </div>

        <div className="landing-problems__grid">
          {LANDING_PROBLEMS.map((problem, index) => (
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
            <span>Не тушим пожары по одному. Выстраиваем систему, в которой риски видны заранее.</span>
          </div>
          <a href="#process">Посмотреть процесс <LandingIcon name="arrow" size={17} /></a>
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
          <span className="landing-kicker">Как мы работаем</span>
          <h2>Простой процесс. <span>Постоянный контроль.</span></h2>
          <p>От первого сигнала до понятного отчёта — каждый шаг встроен в один рабочий контур.</p>
        </div>

        <div className="landing-process__steps">
          {LANDING_STEPS.map((step, index) => (
            <article className={`landing-processStep landing-processStep--${step.tone}`} key={step.number} data-landing-reveal style={{ '--landing-delay': `${index * 65}ms` }}>
              <div className="landing-processStep__number">{step.number}</div>
              <div className="landing-processStep__line" />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>

        <div className="landing-monitorPanel" data-landing-reveal>
          <div className="landing-monitorPanel__copy">
            <span className="landing-monitorPanel__live"><i /> LIVE MONITORING</span>
            <h3>Видим всё. Контролируем всё.</h3>
            <p>Собираем сигналы с ключевых площадок и превращаем разрозненные упоминания в понятную картину репутации.</p>
            <div className="landing-monitorPanel__sources">
              {LANDING_PLATFORMS.map((source) => (
                <div key={source}><LandingIcon name="checkCircle" size={17} /><span>{source}</span></div>
              ))}
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
            <div className="landing-monitorPanel__badge is-one"><strong>2ГИС</strong><span>новый отзыв</span></div>
            <div className="landing-monitorPanel__badge is-two"><strong>Яндекс</strong><span>рейтинг +0.1</span></div>
            <div className="landing-monitorPanel__badge is-three"><strong>СМИ</strong><span>упоминание</span></div>
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
          <span className="landing-kicker">Наши возможности</span>
          <h2>Бизнес Щит — <span>это не только отзывы.</span></h2>
          <p>Один продукт объединяет инструменты для репутации, команды, контента и операционной работы.</p>
        </div>

        <div className="landing-capabilities__grid">
          {LANDING_CAPABILITIES.map((item, index) => (
            <article className="landing-capabilityCard" key={item.key} data-landing-reveal style={{ '--landing-delay': `${(index % 4) * 55}ms` }}>
              <span className={`landing-capabilityCard__icon is-${index % 4}`}><LandingIcon name={item.icon} size={21} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className="landing-capabilityCard__index">{String(index + 1).padStart(2, '0')}</span>
            </article>
          ))}
        </div>

        <div className="landing-capabilities__more" data-landing-reveal>
          <span>12 модулей уже в экосистеме</span>
          <strong>Ещё больше — внутри конструктора продукта.</strong>
        </div>
      </div>
    </section>
  );
}
