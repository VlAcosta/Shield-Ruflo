import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellIcon, ChevronIcon, ExternalIcon, RefreshIcon, SearchIcon, LockIcon } from '../icons';
import { ADMIN_GLOBAL_SEARCH } from '../adminSearchRegistry';

const alerts = [
  { id: 1, title: 'Новый тикет #1008', text: 'ООО «ТехСервис» сообщает о проблеме синхронизации', time: '4 мин', tone: 'danger', to: '/admin/tickets' },
  { id: 2, title: 'Истекает подписка', text: '2 клиента требуют внимания в ближайшие 7 дней', time: '18 мин', tone: 'warning', to: '/admin/subscriptions' },
  { id: 3, title: 'Низкий рейтинг клиента', text: 'ИП Петров И.С. — рейтинг снизился до 2.8', time: '1 ч', tone: 'violet', to: '/admin/clients/petrov' },
];

export default function AdminTopbar({ eyebrow = 'Обзор системы', title = 'Дашборд', onLock, searchItems = [], onRefresh }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return [...searchItems, ...ADMIN_GLOBAL_SEARCH]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
      .filter((item) => `${item.title} ${item.description || ''} ${item.keywords || ''}`.toLowerCase().includes(normalized))
      .slice(0, 7);
  }, [query, searchItems]);

  useEffect(() => setActiveResult(0), [query]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setAlertsOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setAlertsOpen(false);
        setProfileOpen(false);
        if (document.activeElement === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const jumpTo = (item) => {
    if (!item) return;
    if (item.to) navigate(item.to);
    else document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setQuery('');
  };

  const handleSearchKeyDown = (event) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResult((current) => (current + 1) % results.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResult((current) => (current - 1 + results.length) % results.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpTo(results[activeResult]);
    }
  };

  return (
    <header ref={rootRef} className="admin-topbar">
      <div className="admin-topbar__heading">
        <span className="admin-topbar__admin-badge"><i /> ADMIN</span>
        <div>
          <small>{eyebrow}</small>
          <h1>{title}</h1>
        </div>
      </div>

      <div className={`admin-topbar__search ${query ? 'has-query' : ''}`}>
        <SearchIcon />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Поиск клиентов, тикетов, метрик…"
          aria-label="Поиск по админ-панели"
        />
        {!query ? <kbd>Ctrl K</kbd> : <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">×</button>}
        {results.length ? (
          <div className="admin-topbar__search-results">
            <div className="admin-topbar__search-caption">БЫСТРЫЙ ПЕРЕХОД</div>
            {results.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={index === activeResult ? 'is-active' : ''}
                onMouseEnter={() => setActiveResult(index)}
                onClick={() => jumpTo(item)}
              >
                <i>{String(index + 1).padStart(2, '0')}</i>
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
                <b>↗</b>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="admin-topbar__actions">
        <div className="admin-topbar__live"><i /><span>LIVE</span></div>
        <button type="button" className="admin-topbar__icon admin-topbar__refresh" onClick={onRefresh} aria-label="Обновить данные"><RefreshIcon /></button>
        <button type="button" className="admin-topbar__cabinet" onClick={() => navigate('/dashboard')}><ExternalIcon /><span>Кабинет</span></button>

        <div className="admin-topbar__popover-wrap">
          <button
            type="button"
            className={`admin-topbar__icon admin-topbar__bell ${alertsOpen ? 'is-open' : ''}`}
            onClick={() => { setAlertsOpen((v) => !v); setProfileOpen(false); }}
            aria-label="Уведомления"
          >
            <BellIcon /><em>5</em>
          </button>
          {alertsOpen ? (
            <div className="admin-topbar__popover admin-topbar__alerts">
              <header>
                <div><small>ЦЕНТР СОБЫТИЙ</small><strong>Уведомления</strong></div>
                <span>3 новых</span>
              </header>
              {alerts.map((item, index) => (
                <button type="button" key={item.id} style={{ '--alert-index': index }} onClick={() => { setAlertsOpen(false); navigate(item.to); }}>
                  <i className={`is-${item.tone}`} />
                  <span><strong>{item.title}</strong><small>{item.text}</small><time>{item.time}</time></span>
                  <b>›</b>
                </button>
              ))}
              <footer><button type="button" onClick={() => { setAlertsOpen(false); navigate('/admin/tickets'); }}>Открыть центр событий <span>→</span></button></footer>
            </div>
          ) : null}
        </div>

        <div className="admin-topbar__popover-wrap">
          <button type="button" className={`admin-topbar__profile-trigger ${profileOpen ? 'is-open' : ''}`} onClick={() => { setProfileOpen((v) => !v); setAlertsOpen(false); }}>
            <span>АД</span>
            <div><strong>Admin</strong><small>Superadmin</small></div>
            <ChevronIcon />
          </button>
          {profileOpen ? (
            <div className="admin-topbar__popover admin-topbar__profile-menu">
              <div className="admin-topbar__profile-head"><span>АД</span><div><strong>Admin</strong><small>admin@biznesshield.ru</small></div><i /></div>
              <button type="button" onClick={() => navigate('/dashboard')}><ExternalIcon /><span><strong>Пользовательский кабинет</strong><small>Открыть клиентскую часть</small></span><b>↗</b></button>
              <button type="button" onClick={() => { setProfileOpen(false); navigate('/admin/settings?tab=security'); }}><span aria-hidden="true">⚙</span><span><strong>Настройки Admin</strong><small>Безопасность и конфигурация</small></span><b>›</b></button>
              <button type="button" onClick={onLock}><LockIcon /><span><strong>Заблокировать</strong><small>Для входа потребуется PIN</small></span><b>⌁</b></button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
