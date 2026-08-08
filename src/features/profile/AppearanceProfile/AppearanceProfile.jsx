import React, { useMemo } from 'react';
import useAppearance from '../../appearance/hooks/useAppearance';
import { APPEARANCE_MODES } from '../../../services/appearance/appearanceService';
import './AppearanceProfile.scss';

const OPTIONS = [
  {
    id: APPEARANCE_MODES.light,
    label: 'Светлая',
    caption: 'Чистый светлый интерфейс для дневной работы.',
    badge: 'LIGHT',
  },
  {
    id: APPEARANCE_MODES.dark,
    label: 'Тёмная',
    caption: 'Контрастный operational-интерфейс для вечерней работы.',
    badge: 'DARK',
  },
  {
    id: APPEARANCE_MODES.system,
    label: 'Системная',
    caption: 'Автоматически повторяет оформление Windows, macOS или браузера.',
    badge: 'AUTO',
  },
];

function Preview({ mode, resolvedTheme }) {
  const previewTheme = mode === APPEARANCE_MODES.system ? resolvedTheme : mode;
  return (
    <div className={`appearance-profile__preview is-${previewTheme}`} aria-hidden="true">
      <span className="appearance-profile__previewSidebar">
        <i /><i /><i /><i />
      </span>
      <span className="appearance-profile__previewBody">
        <span className="appearance-profile__previewTop"><i /><i /></span>
        <span className="appearance-profile__previewHero"><i /><b /></span>
        <span className="appearance-profile__previewGrid"><i /><i /><i /></span>
      </span>
    </div>
  );
}

export default function AppearanceProfile() {
  const appearance = useAppearance();
  const reduceMotion = useMemo(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ), []);

  return (
    <section className="appearance-profile">
      <div className="appearance-profile__hero">
        <div className="appearance-profile__heroCopy">
          <span className="appearance-profile__eyebrow"><i /> APPEARANCE CENTER</span>
          <h2>Кабинет, который <em>подстраивается под вас.</em></h2>
          <p>Оформление применяется ко всему пользовательскому кабинету: Dashboard, отзывы, репутация, автоматизации, задачи, отчёты и профиль.</p>
          <div className="appearance-profile__status">
            <span>Активная тема</span>
            <strong>{appearance.isDark ? 'Тёмная' : 'Светлая'}</strong>
            {appearance.isSystem ? <small>Синхронизировано с системой</small> : <small>Выбрано вручную</small>}
          </div>
        </div>
        <Preview mode={appearance.mode} resolvedTheme={appearance.resolvedTheme} />
      </div>

      <div className="appearance-profile__sectionHead">
        <div>
          <span>ИНТЕРФЕЙС</span>
          <h3>Выберите оформление</h3>
          <p>Изменение применяется сразу и сохраняется только для вашего аккаунта.</p>
        </div>
      </div>

      <div className="appearance-profile__choices" role="radiogroup" aria-label="Тема кабинета">
        {OPTIONS.map((option, index) => {
          const active = appearance.mode === option.id;
          return (
            <button
              type="button"
              key={option.id}
              role="radio"
              aria-checked={active}
              className={`appearance-profile__choice is-${option.id} ${active ? 'is-active' : ''}`}
              onClick={() => appearance.setMode(option.id)}
              style={{ '--appearance-index': index }}
            >
              <Preview mode={option.id} resolvedTheme={appearance.systemTheme} />
              <span className="appearance-profile__choiceMeta">
                <span>
                  <b>{option.badge}</b>
                  <strong>{option.label}</strong>
                </span>
                <i className="appearance-profile__radio"><u /></i>
              </span>
              <small>{option.caption}</small>
              {option.id === APPEARANCE_MODES.system ? (
                <em>Сейчас система использует: {appearance.systemTheme === 'dark' ? 'тёмную' : 'светлую'}</em>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="appearance-profile__details">
        <article>
          <span className="appearance-profile__detailIcon">Aa</span>
          <div><strong>Контраст и читаемость</strong><p>Цвета меняются без инверсии интерфейса: графики, статусы и акценты сохраняют смысл.</p></div>
        </article>
        <article>
          <span className="appearance-profile__detailIcon">◌</span>
          <div><strong>Системная тема</strong><p>При выборе «Системная» кабинет переключается вместе с настройкой операционной системы.</p></div>
        </article>
        <article>
          <span className="appearance-profile__detailIcon">↯</span>
          <div><strong>Анимации</strong><p>{reduceMotion ? 'ОС просит уменьшить движение — декоративные анимации будут сокращены.' : 'Плавные переходы темы включены; reduced-motion поддерживается автоматически.'}</p></div>
        </article>
      </div>
    </section>
  );
}
