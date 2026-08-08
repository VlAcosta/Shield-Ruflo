import React from "react";

import iconDesign from "../../assets/main-site/design.svg";
import iconContent from "../../assets/main-site/content.svg";
import iconBranding from "../../assets/main-site/brend.svg";
import iconSpecialists from "../../assets/main-site/team_spec.svg";
import promoImage from "../../assets/main-site/promo.png";

export default function Str9() {
  return (
    <section className="str9">
      <div className="str9__container">

        <div className="str9__badge">Доп Услуги</div>

        <h2 className="str9__title">
          ПОЛНЫЙ АРСЕНАЛ <br />
          НЕ ТОЛЬКО РЕПУТАЦИЯ
        </h2>

        <p className="str9__subtitle">
          Вам нужны не только отзывы! Вам нужно, чтобы бренд выглядел дорого,
          говорил правильно и запоминался.
        </p>

        {/* SERVICES */}
        <div className="str9__grid">

          <article className="str9__card">
            <div className="str9__cardHead">
              <img src={iconDesign} alt="" className="str9__icon icon_red" />
              <h3 className="str9__cardTitle">ДИЗАЙН</h3>
            </div>

            <p className="str9__accent str9__accent--pink">
              Карточки для соцсетей, баннеры, визитки, меню, вывески, карточки товаров
            </p>

            <p className="str9__text">
              Стильно, современно, в фирменном стиле. Без аутсорса —
              всё делаем сами. Быстро и конфиденциально.
            </p>
          </article>

          <article className="str9__card">
            <div className="str9__cardHead">
              <img src={iconContent} alt="" className="str9__icon icon_blue" />
              <h3 className="str9__cardTitle">КОНТЕНТ</h3>
            </div>

            <p className="str9__accent str9__accent--blue">
              Посты, статьи, рассылки, сценарии для рилс.
            </p>

            <p className="str9__text">
              Экспертно, понятно, без воды и в короткие сроки.
              Пора занимать первенство в чартах.
            </p>
          </article>

          <article className="str9__card">
            <div className="str9__cardHead">
              <img src={iconBranding} alt="" className="str9__icon icon_purple" />
              <h3 className="str9__cardTitle">БРЕНДИНГ</h3>
            </div>

            <p className="str9__accent str9__accent--purple">
              Логотип, айдентика, гайдлайн.
            </p>

            <p className="str9__text">
              Чтобы вас узнавали с одного взгляда.
            </p>
          </article>

          <article className="str9__card">
            <div className="str9__cardHead">
              <img src={iconSpecialists} alt="" className="str9__icon icon_orange" />
              <h3 className="str9__cardTitle">СПЕЦИАЛИСТЫ</h3>
            </div>

            <p className="str9__accent str9__accent--orange">
              Юрист, дизайнер, маркетолог?
            </p>

            <p className="str9__text">
              Вы получаете консультацию, результат и полноценную команду.
            </p>
          </article>

        </div>

        {/* DARK PROMO BLOCK */}
        <div className="str9__promo">

          <div className="str9__promoContent">
            <h3 className="str9__promoTitle">
              Креативный дизайн для <br /> вашего бренда
            </h3>

            <p className="str9__promoDesc">
              Наша команда создаёт визуальный контент, который продаёт.
              Всё в едином стиле.
            </p>

            <button className="str9__promoBtn">
              Закажем?
            </button>
          </div>

          <img src={promoImage} alt="" className="str9__promoImg" />

        </div>

        {/* FAQ */}
        <div className="str9__faq">
          <div className="str9__faqBadge">Частые вопросы</div>

          <h3 className="str9__faqTitle">
            Ответы на ваши вопросы!
          </h3>

          <p className="str9__faqSub">
            Не нашли ответ? Напишите нам!
          </p>

          <div className="str9__accordion">
            <details className="str9__item">
              <summary>Сколько времени занимает подключение?</summary>
              <p>Обычно 1–2 дня после согласования.</p>
            </details>

            <details className="str9__item">
              <summary>Какие площадки вы мониторите?</summary>
              <p>Карты, маркетплейсы, соцсети и СМИ.</p>
            </details>

            <details className="str9__item">
              <summary>Можно ли без подписки?</summary>
              <p>Да, есть разовые работы.</p>
            </details>
          </div>
        </div>

        {/* CONTACT */}
        <div className="str9__contact">
          <h3>Остались вопросы?</h3>
          <p>Свяжитесь с нами любым удобным способом</p>

          <div className="str9__contactBtns">
            <button className="str9__btnPrimary">
              Написать в чат
            </button>

            <button className="str9__btnGhost">
              Заказать звонок
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}