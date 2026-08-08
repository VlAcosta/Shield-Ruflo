import React from "react";

import iconBasic from "../../assets/main-site/pricing-basic.png";      
import iconPro from "../../assets/main-site/pricing-pro.png";
import iconUltimate from "../../assets/main-site/pricing-ultimate.png";

const plans = [
  {
    key: "basic",
    title: "БАЗОВЫЙ",
    desc: "Вы больше не пропустите негатив! И ещё больше внутри уже в базовой подписке...",
    price: "Стоимость: 2.500₽",
    color: "blue",
    icon: iconBasic,
    features: [
      "Мониторинг 24/7",
      "Уведомления о новых отзывах",
      "Ответы на негатив уже в вашем профиле",
      "Базовая аналитика",
      "Дизайнер рисует для вас, но есть ограничения",
      "Мобильное приложение для большего удобства",
    ],
  },
  {
    key: "pro",
    title: "ПРОДВИНУТЫЙ",
    desc: "Мы поможем задать курс и вас уже начинают цитировать,рекомендовать,выбирать.",
    price: "Стоимость: 8.500₽",
    color: "purple",
    icon: iconPro,
    popular: true,
    features: [
      "Всё из “базового” тарифа,но с расширениями",
      "QR и продвинутые решения",
      "Досье на конкурентов",
      "Стратегия роста репутации",
      "Отчёты каждую пятницу",
      "Создаём контент для вас и за вас",
    ],
  },
  {
    key: "ultimate",
    title: "УЛЬТИМАТИВНЫЙ",
    desc: "Вы - первый номер. Конкуренты смотрят на ваши успехи и завидуют.",
    price: "Стоимость: 44.000₽",
    color: "orange",
    icon: iconUltimate,
    features: [
      "Всё из наших тарифов",
      "Команда специалистов",
      "Дизайн и контент сопровождение",
      "Работа со СМИ и личным брендом",
      "Персональный менеджер",
      "Никаких ограничений",
    ],
  },
];

export default function Str5() {
  return (
    <section className="str5">
      <div className="str5__container">
        <div className="str5__badge">Выберите свой щит</div>

        <h2 className="str5__title">
          ТРИ ЩИТА
          <br />
          ТРИ УРОВНЯ СПОКОЙСТВИЯ
        </h2>

        <div className="str5__cards">
          {plans.map((p) => (
            <article
              key={p.key}
              className={`str5__card str5__card--${p.color} ${p.popular ? "is-popular" : ""}`}
            >
              {p.popular && (
                <div className="str5__popular">
                  <span className="str5__star">★</span>
                  Популярный
                </div>
              )}

              <div className="str5__cardHead">
                <div className="str5__emoji">
                  <img src={p.icon} alt="" />
                </div>
                <h3 className="str5__cardTitle">{p.title}</h3>
              </div>

              <p className="str5__desc">{p.desc}</p>

              <ul className="str5__list">
                {p.features.map((f, i) => (
                  <li className="str5__li" key={i}>
                    <span className="str5__check">✓</span>
                    <span className="str5__liText">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="str5__price">{p.price}</div>

              <button className={`str5__btn str5__btn--${p.color}`} type="button">
                Выбрать тариф
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}