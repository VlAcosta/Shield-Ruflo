import React from "react";

import search from "../../assets/main-site/search.svg";
import notification from "../../assets/main-site/notification.svg";
import answer from "../../assets/main-site/answer.svg";
import growUp from "../../assets/main-site/grow up.svg";
import document from "../../assets/main-site/document.svg";
import research from "../../assets/main-site/research 1.svg";

const steps = [
  { n: "01", title: "Мониторим", desc: "Сканируем площадки 24/7", icon: search, theme: "blue" },
  {
    n: "02",
    title: "Уведомляем",
    desc: "Мгновенно сообщаем о новых отзывах вы всегда в курсе происходящего",
    icon: notification,
    theme: "purple",
  },
  {
    n: "03",
    title: "Отвечаем",
    desc: "Профессионально работаем с негативом и собираем позитивные отзывы",
    icon: answer,
    theme: "green",
  },
  {
    n: "04",
    title: "Растим",
    desc: "Выстраиваем стратегию роста репутации и работаем с показателями",
    icon: growUp,
    theme: "orange",
  },
  {
    n: "05",
    title: "Отчитываемся",
    desc: "Присылаем понятные отчёты каждую пятницу - вся информация в одном месте",
    icon: document,
    theme: "pink",
  },
];

const capabilities = [
  { text: "Создаём дизайн своими силами, а зачем вам будет нужен аутсорс?", cta: "ДИЗАЙН" },
  { text: "Проводим аналитику ваших конкурентов и даём рекомендации", cta: "АНАЛИТИКА" },
  { text: "У нас вы можете научиться и открывать новое, что будет очень кстати!", cta: "КУРСЫ" },

  { text: "Автоматизируем ответы на отзывы от лица вашей компании. Вы в надёжных руках!", cta: "АВТОМАТИЗАЦИЯ" },
  { text: "Предоставляем готовые решения для оптимизации работы с отзывами", cta: "ГОТОВЫЕ РЕШЕНИЯ" },
  { text: "Когда имя порочат, а компромисса казалось бы не может и быть? Просто отдайте это нашим юристам", cta: "ЮР.КОНСУЛЬТАЦИЯ" },

  { text: "Пришлём чек лист на актуальные проблемы или создайте свой", cta: "ЧЕК ЛИСТ" },
  { text: "Замедляют мессенджеры, а общение с командой важно? У нас есть решение!", cta: "МЕССЕНДЖЕР" },
  { text: "Устали заполнять на разных площадках формы для продвижения? У нас есть список готовых решений и тут!", cta: "ПРОДВИЖЕНИЕ" },

  { text: "Автоматизируем выход ваших постов", cta: "КОНТЕНТ" },
  { text: "Составили крупную базу с полезными материалами в сфере работы с отзывами и продвижением", cta: "БАЗА ЗНАНИЙ" },
  { text: "Устали самостоятельно смотреть метрики? Или просто хочется душа на телефон с отчётами? Не вопрос!", cta: "ОТЧЁТНОСТЬ" },
];

const sources = [
  "Яндекс Карты,Google Maps,2ГИС",
  "Вконтакте,Instagram,Facebook",
  "Отзовик,Zoon,Flamp",
  "WB,OZON,Яндекс.Маркет",
  "СМИ,новостные порталы",
];

export default function Str3() {
  return (
    <section className="str3">
      <div className="str3__container">
        <div className="str3__top">
          <div className="str3__badge">Как мы работаем?</div>

          <h2 className="str3__title">Простой и понятный процесс</h2>
          <p className="str3__subtitle">Наши шаги для построения вашей безупречной репутации</p>

          <div className="str3__steps">
            {steps.map((s) => (
              <article className={`str3__step str3__step--${s.theme}`} key={s.n}>
                <div className="str3__stepHead">
                  <div className="str3__iconBox">
                    <img src={s.icon} alt="" />
                  </div>
                  <div className="str3__num">{s.n}</div>
                </div>

                <div className="str3__stepTitle">{s.title}</div>
                <div className="str3__stepDesc">{s.desc}</div>
              </article>
            ))}
          </div>
        </div>

        <div className="str3__panel">
          <div className="str3__panelLeft">
            <div className="str3__panelTitle">Видим всё. Контролируем всё.</div>

            <div className="str3__panelText">
              Наша система автоматически отслеживает упоминания вашего бренда на платформах и даёт полную
              картину репутации в реальном времени.
            </div>

            <ul className="str3__list">
              {sources.map((t) => (
                <li className="str3__li" key={t}>
                  <span className="str3__check">✓</span>
                  <span className="str3__liText">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="str3__panelRight">
            <img src={research} alt="research" />
          </div>
        </div>

        <div className="str3__cap">
          <div className="str3__badge str3__badge--soft">Наши возможности</div>

          <h2 className="str3__capTitle">
            БИЗНЕС ЩИТ -<br />
            ЭТО НЕ ПРОСТО ЗАЩИТА
          </h2>

          <p className="str3__capSubtitle">Это комплексная система управления репутацией и не только</p>

          <div className="str3__grid">
            {capabilities.map((c) => (
              <article className="str3__card" key={c.cta}>
                <p className="str3__cardText">{c.text}</p>
                <div className="str3__cardBar">
                  <span className="str3__cardCta">{c.cta}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}