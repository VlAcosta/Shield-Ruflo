import React from 'react';
import { useNavigate } from 'react-router-dom';
import LandingIcon from './LandingIcon';
import { STRATEGY_STATS } from '../model/landingStrategyData';

function ReputationConsole() {
  return (
    <div className="landing-console" aria-label="Пример работы с отзывами — демонстрационные данные">
      <div className="landing-console__topbar">
        <div>
          <span className="landing-console__eyebrow">ДЕМО ИНТЕРФЕЙСА</span>
          <strong>Отзывы под контролем</strong>
        </div>
        <span className="landing-console__online"><i /> пример</span>
      </div>

      <div className="landing-console__scoreRow">
        <div className="landing-console__score">
          <span>Срок ответа</span>
          <strong>2ч</strong>
          <em>пример срока, который задаёт команда</em>
        </div>
        <div className="landing-console__ring" aria-hidden="true">
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="31" className="landing-console__ringTrack" />
            <circle cx="40" cy="40" r="31" className="landing-console__ringValue" pathLength="100" />
          </svg>
          <span>Срок</span>
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
          <div><strong>Негативный отзыв</strong><small>Ожидает ответа команды</small></div>
          <b>Важно</b>
        </div>
        <div className="landing-console__event is-growth">
          <span className="landing-console__eventIcon"><LandingIcon name="check" size={17} /></span>
          <div><strong>Задача по жалобе создана</strong><small>Ответственный назначен</small></div>
          <b>Задача</b>
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
            УПРАВЛЕНИЕ РЕПУТАЦИЕЙ БИЗНЕСА
            <span className="landing-kicker__line" />
          </div>

          <h1>
            Ваша репутация —
            <span>в надёжных руках.</span>
          </h1>

          <p className="landing-hero__lead">
            Собирайте отзывы с подключённых площадок в одном кабинете. Отвечайте клиентам, поручайте задачи команде и следите за репутацией вашего бизнеса.
          </p>

          <div className="landing-hero__buttons">
            <button className="landing-btn landing-btn--gradient landing-btn--large" type="button" onClick={() => navigate('/pricing')}>
              Начать защиту
              <LandingIcon name="arrow" size={19} />
            </button>
            <a className="landing-btn landing-btn--soft landing-btn--large" href="#process">
              <span className="landing-btn__play"><LandingIcon name="play" size={15} /></span>
              Как это работает
            </a>
          </div>

          <div className="landing-hero__proof">
            <span><i /> Отзывы · ответы · задачи · отчёты</span>
            <span>Возможности подключения зависят от площадки</span>
          </div>
        </div>

        <div className="landing-hero__visual" data-landing-reveal>
          <div className="landing-hero__visualHalo" />
          <ReputationConsole />
          <div className="landing-floatingCard landing-floatingCard--left">
            <span className="landing-floatingCard__icon is-pink"><LandingIcon name="message" size={18} /></span>
            <div><small>Новый отзыв</small><strong>Команда видит, кому ответить</strong></div>
          </div>
          <div className="landing-floatingCard landing-floatingCard--right">
            <span className="landing-floatingCard__icon is-green"><LandingIcon name="checkCircle" size={18} /></span>
            <div><small>Работа над ошибками</small><strong>У каждой задачи есть ответственный</strong></div>
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
