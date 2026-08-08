import React from 'react';
import BrandMark from '../../../components/brand/BrandMark';

const LINKS = [
  ['Продукт', ['Возможности', 'Как работаем', 'Тарифы', 'Кейсы']],
  ['Компания', ['О продукте', 'Команда', 'Отрасли', 'Доп. услуги']],
  ['Помощь', ['FAQ', 'Войти в кабинет', 'Документация', 'Поддержка']],
];

export default function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-shell">
        <div className="landing-footer__top">
          <div className="landing-footer__brand">
            <a className="landing-brand landing-brand--dark" href="#top">
              <span className="landing-brand__mark"><BrandMark size={40} /></span>
              <span className="landing-brand__copy"><strong>БИЗНЕС ЩИТ</strong><small>reputation operating system</small></span>
            </a>
            <p>Ваша репутация в надёжных руках. Защищаем и развиваем онлайн-репутацию бизнеса с 2022 года.</p>
            <strong>Вы работаете. Мы прикрываем.</strong>
          </div>

          <div className="landing-footer__links">
            {LINKS.map(([title, items]) => (
              <div key={title}>
                <strong>{title}</strong>
                {items.map((item) => <span key={item}>{item}</span>)}
              </div>
            ))}
          </div>
        </div>

        <div className="landing-footer__bottom">
          <span>© 2026 Бизнес Щит. Все права защищены.</span>
          <span>* Instagram и Facebook — продукты Meta, признанной экстремистской организацией в РФ.</span>
        </div>
      </div>
    </footer>
  );
}
