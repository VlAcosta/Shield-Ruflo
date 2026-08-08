import React from "react";
import "../../scss/footer.scss";

import logo from "../../assets/main-site/shield.svg"; 

export default function Footer() {
  return (
    <footer className="siteFooter">
      <div className="siteFooter__container">
        <div className="siteFooter__left">
          <div className="siteFooter__brand">
            <img className="siteFooter__logo" src={logo} alt="" />
            <div className="siteFooter__name">БИЗНЕС ЩИТ</div>
          </div>

          <p className="siteFooter__text">
            Ваша репутация в надёжных руках. Защищаем и развиваем онлайн-репутацию бизнеса с 2022 года.
          </p>
          <p className="siteFooter__text muted">Вы работаете. Мы прикрываем.</p>
        </div>

        <div className="siteFooter__right">
          <div className="siteFooter__title">Контакты</div>

          <div className="siteFooter__links">
            <a className="siteFooter__link" href="#">
              Instagram
            </a>
            <a className="siteFooter__link" href="#">
              Facebook
            </a>
          </div>
        </div>
      </div>

      <div className="siteFooter__bottom">
        <div className="siteFooter__line" />
        <div className="siteFooter__copy">© 2026 Бизнес Щит. Все права защищены.</div>
        <div className="siteFooter__disc">
          *Instagram и Facebook — продукты Meta, признанной экстремистской организацией в РФ
        </div>
      </div>
    </footer>
  );
}