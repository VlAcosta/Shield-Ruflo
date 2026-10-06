import React from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../../../components/brand/BrandMark';

const LINKS = [
  ['Продукт', [['Как это работает', '#process'], ['Возможности', '#capabilities'], ['Тарифы', '#pricing'], ['Почему Бизнес Щит', '#product-truth']]],
  ['Для кого', [['Локальный бизнес', '#segment-local'], ['Сети и филиалы', '#segment-network'], ['Магазины и маркетплейсы', '#segment-marketplace']]],
  ['Помощь', [['Частые вопросы', '#faq'], ['Войти в кабинет', '/auth?mode=login'], ['Дополнительные услуги', '#managed-services'], ['Сравнить тарифы', '/pricing']]],
];

export default function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-shell">
        <div className="landing-footer__top">
          <div className="landing-footer__brand">
            <a className="landing-brand landing-brand--dark" href="#top">
              <span className="landing-brand__mark"><BrandMark size={40} /></span>
              <span className="landing-brand__copy"><strong>БИЗНЕС ЩИТ</strong><small>Управление репутацией</small></span>
            </a>
            <p>Отзывы, ответы клиентам, задачи и аналитика — в одном кабинете.</p>
            <strong>Ваша репутация — в надёжных руках.</strong>
          </div>

          <nav className="landing-footer__links" aria-label="Навигация внизу страницы">
            {LINKS.map(([title, items]) => (
              <div key={title}>
                <strong>{title}</strong>
                {items.map(([label, href]) => href.startsWith('#')
                  ? <a key={href} href={href}>{label}</a>
                  : <Link key={href} to={href}>{label}</Link>)}
              </div>
            ))}
          </nav>
        </div>

        <div className="landing-footer__bottom">
          <span>© {new Date().getFullYear()} Бизнес Щит. Все права защищены.</span>
          <span>Возможности зависят от тарифа и подключённой площадки.</span>
        </div>
      </div>
    </footer>
  );
}
