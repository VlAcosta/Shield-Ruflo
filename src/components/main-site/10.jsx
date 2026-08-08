import React from "react";

import logoShield from "../../assets/main-site/shield.svg"; 

function Str10() {
  return (
    <>
      <section className="str10-hero">
        <div className="str10-hero__container">
          <h2 className="str10-hero__title">
            Готовы защитить <br /> свою репутацию?
          </h2>

          <p className="str10-hero__sub">
            Начните работать спокойно, доверьте репутацию нам
          </p>

          <div className="str10-hero__chips">
            <div className="str10-hero__chip">Интуитивно понятный интерфейс</div>
            <div className="str10-hero__chip">Настройка и запуск за 25 минут</div>
            <div className="str10-hero__chip">Поддержка специалистов 24/7 на связи</div>
            <div className="str10-hero__chip">Без дополнительных платежей</div>
          </div>

          <div className="str10-hero__btns">
            <button className="str10-hero__btn str10-hero__btn--primary" type="button">
              НАЧАТЬ
            </button>
            <button className="str10-hero__btn str10-hero__btn--ghost" type="button">
              ПОДРОБНЕЕ
            </button>
          </div>
        </div>
      </section>

      <footer className="str10-footer">
        <div className="str10-footer__container">
          <div className="str10-footer__top">
            <div className="str10-footer__brand">
              <div className="str10-footer__brandRow">
                {logoShield ? <img className="str10-footer__logo" src={logoShield} alt="" /> : null}
                <div className="str10-footer__brandName">БИЗНЕС ЩИТ</div>
              </div>

              <p className="str10-footer__text">
                Ваша репутация в надёжных руках. Защищаем и развиваем онлайн-репутацию
                бизнеса с 2022 года.
              </p>

              <p className="str10-footer__textMuted">
                Вы работаете. Мы прикрываем.
              </p>
            </div>

            <div className="str10-footer__contacts">
              <div className="str10-footer__contactsTitle">Контакты</div>
            </div>
          </div>

          <div className="str10-footer__line" />

          <div className="str10-footer__bottom">
            <div className="str10-footer__copy">© 2026 Бизнес Щит. Все права защищены.</div>
            <div className="str10-footer__disc">
              *Instagram и Facebook — продукты Meta, признанной экстремистской организацией в РФ
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default Str10;