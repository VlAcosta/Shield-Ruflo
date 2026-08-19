import React from 'react';
import BrandMark from '../../../components/brand/BrandMark';

const LINKS = [
  ['Продукт', ['Workflow', 'Возможности', 'Тарифы', 'Product truth']],
  ['Для кого', ['Локальный бизнес', 'Сети', 'Marketplace / e-commerce']],
  ['Помощь', ['FAQ', 'Войти в кабинет', 'Managed services', 'Обсудить Business']],
];

export default function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-shell">
        <div className="landing-footer__top">
          <div className="landing-footer__brand">
            <a className="landing-brand landing-brand--dark" href="#top">
              <span className="landing-brand__mark"><BrandMark size={40} /></span>
              <span className="landing-brand__copy"><strong>БИЗНЕС ЩИТ</strong><small>Reputation Operations System</small></span>
            </a>
            <p>Единый operational workflow для отзывов: сигнал, SLA, ответ, согласование, задача, причина и измеримый результат.</p>
            <strong>Публичные capabilities — только по фактической готовности продукта.</strong>
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
          <span>Доступность интеграций и действий зависит от production capability конкретного provider.</span>
        </div>
      </div>
    </footer>
  );
}
