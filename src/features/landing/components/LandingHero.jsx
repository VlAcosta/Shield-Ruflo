import React from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';
import { STRATEGY_STATS } from '../model/landingStrategyData';

function ReputationConsole() {
  return (
    <div className="landing-console" aria-label="Демонстрационный пример интерфейса Reputation Operations">
      <div className="landing-console__topbar">
        <div>
          <span className="landing-console__eyebrow">ДЕМО ИНТЕРФЕЙСА</span>
          <strong>Очередь репутационных событий</strong>
        </div>
        <span className="landing-console__online"><i /> workflow</span>
      </div>

      <div className="landing-console__scoreRow">
        <div className="landing-console__score">
          <span>SLA по негативу</span>
          <strong>2ч</strong>
          <em>пример настройки, не публичная статистика</em>
        </div>
        <div className="landing-console__ring" aria-hidden="true">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="31" className="landing-console__ringTrack" />
            <circle cx="40" cy="40" r="31" className="landing-console__ringValue" pathLength="100" />
          </svg>
          <span>SLA</span>
        </div>
      </div>

      <div className="landing-console__chart" aria-hidden="true">
        <svg viewBox="0 0 420 132" preserveAspectRatio="none">
          <defs>
            <linearGradient id="landingChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7457ff" stopOpacity=".32" />
              <stop offset="100%" stopColor="#7457ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="landing-console__chartArea" d="M0 100C34 97 55 91 82 82S137 70 169 74s49 21 82 8 46-31 83-33 55 9 86-7V132H0Z" fill="url(#landingChartFill)" />
          <path className="landing-console__chartLine" d="M0 100C34 97 55 91 82 82S137 70 169 74s49 21 82 8 46-31 83-33 55 9 86-7" />
        </svg>
        <div className="landing-console__chartLabels"><span>сигнал</span><span>действие</span><span>результат</span></div>
      </div>

      <div className="landing-console__feed">
        <div className="landing-console__event is-review">
          <span className="landing-console__eventIcon"><LandingIcon name="star" size={17} /></span>
          <div><strong>Негативный отзыв</strong><small>SLA запущен · нужен ответ</small></div>
          <b>Risk</b>
        </div>
        <div className="landing-console__event is-growth">
          <span className="landing-console__eventIcon"><LandingIcon name="check" size={17} /></span>
          <div><strong>Причина переведена в задачу</strong><small>владелец назначен · история сохранена</small></div>
          <b>Task</b>
        </div>
      </div>
    </div>
  );
}

export default function LandingHero() {
  const navigate = useNavigate();

  return (
    <section className="landing-hero" id="top">
      <div className="landing-hero__orb landing-hero__orb--one" />
      <div className="landing-hero__orb landing-hero__orb--two" />

      <div className="landing-shell landing-hero__grid">
        <div className="landing-hero__content" data-landing-reveal>
          <div className="landing-kicker landing-kicker--hero">
            <span className="landing-kicker__dot" />
            REPUTATION OPERATIONS SYSTEM
            <span className="landing-kicker__line" />
          </div>

          <h1>
            От репутационного сигнала —
            <span>к реакции, задаче и результату.</span>
          </h1>

          <p className="landing-hero__lead">
            Бизнес Щит собирает отзывы из фактически подключённых источников, помогает команде отвечать в SLA, согласовывать сложные реакции, превращать негатив в задачи и показывать руководителю причины и результат.
          </p>

          <div className="landing-hero__buttons">
            <button className="landing-btn landing-btn--gradient landing-btn--large" type="button" onClick={() => navigate('/pricing')}>
              Начать 14-дневный trial
              <LandingIcon name="arrow" size={19} />
            </button>
            <a className="landing-btn landing-btn--soft landing-btn--large" href="#process">
              <span className="landing-btn__play"><LandingIcon name="play" size={15} /></span>
              Показать workflow
            </a>
          </div>

          <div className="landing-hero__proof">
            <span><i /> SLA · approval · audit · tasks</span>
            <span>Capabilities показываются по фактической готовности provider</span>
          </div>
        </div>

        <div className="landing-hero__visual" data-landing-reveal>
          <div className="landing-hero__visualHalo" />
          <ReputationConsole />
          <div className="landing-floatingCard landing-floatingCard--left">
            <span className="landing-floatingCard__icon is-pink"><LandingIcon name="message" size={18} /></span>
            <div><small>Detect → Prioritize</small><strong>Событие попало в SLA</strong></div>
          </div>
          <div className="landing-floatingCard landing-floatingCard--right">
            <span className="landing-floatingCard__icon is-green"><LandingIcon name="checkCircle" size={18} /></span>
            <div><small>Operate → Measure</small><strong>Причина связана с задачей</strong></div>
          </div>
        </div>
      </div>

      <div className="landing-shell landing-hero__stats" data-landing-reveal>
        {STRATEGY_STATS.map((item) => (
          <div className={`landing-stat landing-stat--${item.tone}`} key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
