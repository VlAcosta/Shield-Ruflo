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
          <span className="landing-kicker">Где теряется контроль</span>
          <h2>Проблема не только в негативе. <span>Проблема — в разорванном процессе.</span></h2>
          <p>Бизнесу нужен не ещё один мониторинг, а понятный путь от сигнала до ответственного действия и измеримого результата.</p>
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
                <span>требует процесса</span>
              </div>
            </article>
          ))}
        </div>

        <div className="landing-problems__shield" data-landing-reveal>
          <div className="landing-problems__shieldIcon"><LandingIcon name="shield" size={24} /></div>
          <div>
            <strong>Business Shield закрывает цикл, а не только показывает сигнал.</strong>
            <span>Review → SLA → ответ → согласование → задача → анализ причины → отчёт.</span>
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
          <span className="landing-kicker">Closed-loop Reputation Operations</span>
          <h2>Сигнал проходит <span>семь управляемых этапов.</span></h2>
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
            <span className="landing-monitorPanel__live"><i /> PROVIDER TRUTH</span>
            <h3>Интеграция считается доступной только когда её capability подтверждена.</h3>
            <p>Интерфейс не должен обещать read, reply или sync только потому, что логотип площадки есть в каталоге.</p>
            <div className="landing-monitorPanel__sources">
              <div><LandingIcon name="checkCircle" size={17} /><span>Read — только при production adapter</span></div>
              <div><LandingIcon name="checkCircle" size={17} /><span>Reply — только при подтверждённом publish contract</span></div>
              <div><LandingIcon name="checkCircle" size={17} /><span>Sync — с фактическим health/status и retry state</span></div>
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
            <div className="landing-monitorPanel__badge is-one"><strong>READ</strong><span>capability</span></div>
            <div className="landing-monitorPanel__badge is-two"><strong>REPLY</strong><span>capability</span></div>
            <div className="landing-monitorPanel__badge is-three"><strong>HEALTH</strong><span>runtime state</span></div>
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
          <span className="landing-kicker">Ядро платформы</span>
          <h2>Не «12 инструментов». <span>Один управляемый reputation workflow.</span></h2>
          <p>Дизайн, content, legal и managed replies могут подключаться отдельно. Причина купить платформу — операционный контур работы с репутацией.</p>
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
          <span>CORE PLATFORM</span>
          <strong>Managed services продаются отдельно и не размывают SaaS-пакет.</strong>
        </div>
      </div>
    </section>
  );
}
