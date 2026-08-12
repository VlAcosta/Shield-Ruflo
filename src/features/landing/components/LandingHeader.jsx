import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import shieldLogo from '../../../assets/main-site/shield.svg';
import LandingIcon from './LandingIcon';

const NAV_ITEMS = [
  ['Workflow', 'process'],
  ['Возможности', 'capabilities'],
  ['Кому подходит', 'segments'],
  ['Тарифы', 'pricing'],
  ['FAQ', 'faq'],
];

export default function LandingHeader() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="landing-header">
      <div className="landing-shell landing-header__inner">
        <a className="landing-brand" href="#top" onClick={closeMenu} aria-label="Бизнес Щит — на главную">
          <span className="landing-brand__mark">
            <img src={shieldLogo} alt="" />
          </span>
          <span className="landing-brand__copy">
            <strong>БИЗНЕС ЩИТ</strong>
            <small>Reputation Operations System</small>
          </span>
        </a>

        <nav className="landing-header__nav" aria-label="Навигация по главной странице">
          {NAV_ITEMS.map(([label, id]) => (
            <a key={id} href={`#${id}`}>{label}</a>
          ))}
        </nav>

        <div className="landing-header__actions">
          <button className="landing-btn landing-btn--quiet landing-header__login" type="button" onClick={() => navigate('/auth?mode=login')}>
            Войти
          </button>
          <button className="landing-btn landing-btn--dark landing-header__cta" type="button" onClick={() => navigate('/pricing')}>
            Начать
            <LandingIcon name="arrow" size={18} />
          </button>
          <button
            type="button"
            className="landing-header__menuBtn"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <LandingIcon name={menuOpen ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      <div className={`landing-mobileMenu ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
        <div className="landing-mobileMenu__panel">
          {NAV_ITEMS.map(([label, id]) => (
            <a key={id} href={`#${id}`} onClick={closeMenu}>{label}</a>
          ))}
          <div className="landing-mobileMenu__actions">
            <button className="landing-btn landing-btn--soft" type="button" onClick={() => { closeMenu(); navigate('/auth?mode=login'); }}>Войти в кабинет</button>
            <button className="landing-btn landing-btn--gradient" type="button" onClick={() => { closeMenu(); navigate('/pricing'); }}>Посмотреть тарифы</button>
          </div>
        </div>
      </div>
    </header>
  );
}
