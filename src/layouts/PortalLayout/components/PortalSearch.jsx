import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CloseIcon, SearchIcon } from '../icons';
import { portalSearchItems } from '../searchRegistry';
import useAccessControl from '../../../features/access/hooks/useAccessControl';

function normalize(value = '') {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
}

function PortalSearch({ open, onClose, onLock, onOpenReviews }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const access = useAccessControl();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const actions = useMemo(() => ([
    ...portalSearchItems.filter((item) => !item.permission || access.can(item.permission)),
    {
      id: 'reviews-action',
      title: 'Новые отзывы',
      description: 'Открыть последние отзывы без перехода со страницы',
      group: 'Быстрые действия',
      keywords: ['новые отзывы', 'отзывы', 'review'],
      action: onOpenReviews,
      permission: 'reviews.view',
      Icon: SearchIcon,
    },
    {
      id: 'lock-action',
      title: 'Заблокировать кабинет',
      description: 'Потребовать PIN-код для продолжения работы',
      group: 'Быстрые действия',
      keywords: ['блокировка', 'заблокировать', 'pin', 'пин'],
      action: onLock,
      Icon: CloseIcon,
    },
  ].filter((item) => !item.permission || access.can(item.permission))), [access, onLock, onOpenReviews]);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return actions.slice(0, 8);

    return actions.filter((item) => {
      const haystack = normalize([
        item.title,
        item.description,
        ...(item.keywords || []),
      ].join(' '));
      return haystack.includes(needle);
    }).slice(0, 12);
  }, [actions, query]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  if (!open || typeof document === 'undefined') return null;

  const runItem = (item) => {
    onClose();
    if (item.route) navigate(item.route);
    else item.action?.();
  };

  return createPortal(
    <div
      className="portal-command"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="portal-command__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Поиск по кабинету"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((value) => Math.min(results.length - 1, value + 1));
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((value) => Math.max(0, value - 1));
          }

          if (event.key === 'Enter' && results[activeIndex]) {
            event.preventDefault();
            runItem(results[activeIndex]);
          }
        }}
      >
        <div className="portal-command__inputRow">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Найти страницу, функцию или действие..."
            autoComplete="off"
            spellCheck="false"
          />
          <button type="button" onClick={onClose} aria-label="Закрыть поиск">
            <span>ESC</span>
          </button>
        </div>

        <div className="portal-command__body">
          {results.length ? (
            <div className="portal-command__results">
              {results.map((item, index) => {
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`portal-command__result ${index === activeIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem(item)}
                  >
                    <span className="portal-command__resultIcon"><Icon /></span>
                    <span className="portal-command__resultCopy">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="portal-command__resultGroup">{item.group}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="portal-command__empty">
              <span><SearchIcon /></span>
              <strong>Ничего не нашли</strong>
              <p>Попробуйте «задачи», «отчёты», «менеджер» или «безопасность».</p>
            </div>
          )}
        </div>

        <footer className="portal-command__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> выбор</span>
          <span><kbd>Enter</kbd> открыть</span>
          <span><kbd>Esc</kbd> закрыть</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default memo(PortalSearch);
