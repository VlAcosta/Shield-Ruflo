import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import DashboardWidgetState from '../components/DashboardWidgetState';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
} from '../../../services/dashboard/dashboardCalendarService';
import './Calendar.scss';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const EVENT_TYPES = Object.freeze([
  { id: 'work', label: 'Работа с репутацией', short: 'Работа', tone: 'violet' },
  { id: 'report', label: 'Отчёт', short: 'Отчёт', tone: 'cyan' },
  { id: 'meeting', label: 'Встреча', short: 'Встреча', tone: 'green' },
  { id: 'deadline', label: 'Дедлайн', short: 'Дедлайн', tone: 'orange' },
  { id: 'sla', label: 'SLA / риск', short: 'SLA', tone: 'red' },
]);
const FILTERS = Object.freeze([{ id: 'all', label: 'Все' }, ...EVENT_TYPES.map(({ id, short }) => ({ id, label: short }))]);
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const isSameDate = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function getEventMeta(event) {
  const byType = EVENT_TYPES.find((item) => item.id === event?.type);
  if (byType) return byType;
  const byTone = EVENT_TYPES.find((item) => item.tone === event?.tone);
  return byTone || EVENT_TYPES[0];
}

function ArrowIcon({ direction }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={direction === 'left' ? 'M10 3.5L5.5 8L10 12.5' : 'M6 3.5L10.5 8L6 12.5'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 2.8v3.4M13.5 2.8v3.4M3 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.5 3.2V2.4h5v.8M3.5 4.5h9M5 6.2l.45 6.2h5.1L11 6.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function EventComposer({ draft, setDraft, onClose, onSubmit }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="calendar-composer" role="presentation">
      <button type="button" className="calendar-composer__backdrop" onClick={onClose} aria-label="Закрыть форму" />
      <form className="calendar-composer__dialog" onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="calendar-composer-title">
        <header>
          <div>
            <span>PLAN EVENT</span>
            <h2 id="calendar-composer-title">Новое событие</h2>
            <p>Добавьте встречу, дедлайн или контрольную точку в рабочий план.</p>
          </div>
          <button type="button" className="calendar-composer__close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <label className="calendar-composer__field">
          <span>Название</span>
          <input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Например, согласовать ответы за неделю" />
        </label>

        <div className="calendar-composer__grid">
          <label className="calendar-composer__field"><span>Дата</span><input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label>
          <label className="calendar-composer__field"><span>Время</span><input type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} /></label>
        </div>

        <div className="calendar-composer__field">
          <span>Тип события</span>
          <div className="calendar-composer__types">
            {EVENT_TYPES.map((item) => (
              <button type="button" key={item.id} className={`is-${item.tone} ${draft.type === item.id ? 'is-active' : ''}`} onClick={() => setDraft((current) => ({ ...current, type: item.id, tone: item.tone }))}>
                <i />{item.label}
              </button>
            ))}
          </div>
        </div>

        <label className="calendar-composer__field">
          <span>Комментарий <small>необязательно</small></span>
          <textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Что важно не забыть?" rows="3" />
        </label>

        <footer>
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="submit" className="is-primary" disabled={!draft.title.trim() || !draft.date}>Добавить событие</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function Calendar() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [selected, setSelected] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(() => ({ title: '', date: dateKey(today), time: '10:00', type: 'work', tone: 'violet', note: '' }));

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getCalendarEvents();
      setEvents(result.events || []);
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось загрузить календарь');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const filteredEvents = useMemo(() => filter === 'all' ? events : events.filter((event) => getEventMeta(event).id === filter), [events, filter]);
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(cursor.year, cursor.month, 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [cursor]);

  const eventsByDate = useMemo(() => filteredEvents.reduce((map, event) => {
    if (!map[event.date]) map[event.date] = [];
    map[event.date].push(event);
    return map;
  }, {}), [filteredEvents]);

  const selectedEvents = eventsByDate[dateKey(selected)] || [];
  const todayKey = dateKey(today);
  const nextWeekKey = dateKey(addDays(today, 7));
  const upcoming = useMemo(() => [...filteredEvents]
    .filter((event) => event.date >= todayKey)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 4), [filteredEvents, todayKey]);
  const monthEvents = useMemo(() => events.filter((event) => {
    const [year, month] = String(event.date || '').split('-').map(Number);
    return year === cursor.year && month === cursor.month + 1;
  }).length, [cursor.month, cursor.year, events]);
  const weekEvents = useMemo(() => events.filter((event) => event.date >= todayKey && event.date <= nextWeekKey).length, [events, nextWeekKey, todayKey]);

  const changeMonth = useCallback((direction) => {
    setCursor((current) => {
      const date = new Date(current.year, current.month + direction, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }, []);

  const selectDate = useCallback((date) => {
    setSelected(date);
    if (date.getFullYear() !== cursor.year || date.getMonth() !== cursor.month) {
      setCursor({ year: date.getFullYear(), month: date.getMonth() });
    }
  }, [cursor.month, cursor.year]);

  const goToday = useCallback(() => {
    const now = new Date();
    const normalized = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setSelected(normalized);
    setCursor({ year: normalized.getFullYear(), month: normalized.getMonth() });
  }, []);

  const openComposer = useCallback(() => {
    setDraft({ title: '', date: dateKey(selected), time: '10:00', type: 'work', tone: 'violet', note: '' });
    setComposerOpen(true);
  }, [selected]);

  const addEvent = useCallback(async (event) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.date) return;
    const meta = EVENT_TYPES.find((item) => item.id === draft.type) || EVENT_TYPES[0];
    const payload = { title: draft.title.trim(), date: draft.date, time: draft.time || '10:00', type: meta.id, tone: meta.tone, note: draft.note.trim() };
    try {
      const result = await createCalendarEvent(payload, events);
      setEvents(result.events || events);
      const [year, month, day] = draft.date.split('-').map(Number);
      setSelected(new Date(year, month - 1, day));
      setCursor({ year, month: month - 1 });
      setComposerOpen(false);
    } catch (nextError) {
      setError(nextError?.message || 'Не удалось добавить событие');
    }
  }, [draft, events]);

  const removeEvent = useCallback(async (eventId) => {
    const previous = events;
    setEvents((current) => current.filter((item) => item.id !== eventId));
    try {
      const next = await deleteCalendarEvent(eventId, previous);
      setEvents(next);
    } catch (nextError) {
      setEvents(previous);
      setError(nextError?.message || 'Не удалось удалить событие');
    }
  }, [events]);

  return (
    <DashboardCard
      title="Календарь"
      eyebrow="План работы"
      action={(
        <div className="dashboard-calendar__header-actions">
          <button type="button" className="dashboard-calendar__today" onClick={goToday}>Сегодня</button>
          <button type="button" className="dashboard-calendar__add" onClick={openComposer}><PlusIcon /><span>Событие</span></button>
        </div>
      )}
      className="dashboard-calendar"
      motion="right"
    >
      {loading ? <DashboardWidgetState type="loading" /> : error && !events.length ? <DashboardWidgetState type="error" text={error} onRetry={loadEvents} /> : (
        <>
          <div className="dashboard-calendar__summary">
            <div><span className="dashboard-calendar__summary-icon"><CalendarIcon /></span><div><strong>{monthEvents}</strong><small>событий в {MONTHS_GENITIVE[cursor.month]}</small></div></div>
            <div><strong>{weekEvents}</strong><small>ближайшие 7 дней</small></div>
            <div className="dashboard-calendar__filters" aria-label="Фильтр календаря">{FILTERS.map((item) => <button type="button" className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)} key={item.id}>{item.label}</button>)}</div>
          </div>

          <div className="dashboard-calendar__layout">
            <section className="dashboard-calendar__month">
              <header className="dashboard-calendar__month-head">
                <div><span>{cursor.year}</span><strong>{MONTHS[cursor.month]}</strong></div>
                <div className="dashboard-calendar__controls">
                  <button type="button" onClick={() => changeMonth(-1)} aria-label="Предыдущий месяц"><ArrowIcon direction="left" /></button>
                  <button type="button" onClick={() => changeMonth(1)} aria-label="Следующий месяц"><ArrowIcon direction="right" /></button>
                </div>
              </header>

              <div className="dashboard-calendar__weekdays">{WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="dashboard-calendar__days">
                {cells.map((date) => {
                  const key = dateKey(date);
                  const eventList = eventsByDate[key] || [];
                  const outside = date.getMonth() !== cursor.month;
                  const selectedDay = isSameDate(date, selected);
                  const todayDay = isSameDate(date, today);
                  return (
                    <button
                      type="button"
                      className={`dashboard-calendar__day ${outside ? 'is-outside' : ''} ${selectedDay ? 'is-selected' : ''} ${todayDay ? 'is-today' : ''}`.trim()}
                      key={key}
                      onClick={() => selectDate(date)}
                      aria-label={`${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}${eventList.length ? `, событий: ${eventList.length}` : ''}`}
                    >
                      <span>{date.getDate()}</span>
                      {eventList.length ? <i className="dashboard-calendar__event-dots" aria-hidden="true">{eventList.slice(0, 3).map((item) => <b className={`is-${getEventMeta(item).tone}`} key={item.id} />)}</i> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="dashboard-calendar__agenda">
              <div className="dashboard-calendar__selected-date">
                <span>{WEEK_DAYS[(selected.getDay() + 6) % 7]}</span>
                <strong>{selected.getDate()}</strong>
                <small>{MONTHS_GENITIVE[selected.getMonth()]}</small>
              </div>

              <div className="dashboard-calendar__day-events">
                <header><div><strong>События дня</strong><span>{selectedEvents.length ? 'Рабочий план' : 'План свободен'}</span></div><b>{selectedEvents.length}</b></header>
                {selectedEvents.length ? selectedEvents.map((event) => {
                  const meta = getEventMeta(event);
                  return (
                    <article className="dashboard-calendar__event" key={event.id}>
                      <i className={`is-${meta.tone}`} />
                      <div><small>{meta.label}</small><strong>{event.title}</strong><span>{event.time}{event.note ? ` · ${event.note}` : ''}</span></div>
                      <button type="button" onClick={() => removeEvent(event.id)} aria-label={`Удалить ${event.title}`}><TrashIcon /></button>
                    </article>
                  );
                }) : (
                  <button type="button" className="dashboard-calendar__empty" onClick={openComposer}><PlusIcon /><span><strong>Свободный день</strong><small>Добавить событие</small></span></button>
                )}
              </div>

              <div className="dashboard-calendar__upcoming">
                <header><span>Ближайшее</span><small>{upcoming.length ? 'по рабочему плану' : 'нет событий'}</small></header>
                {upcoming.map((event) => {
                  const meta = getEventMeta(event);
                  return <button type="button" key={event.id} onClick={() => { const [year, month, day] = event.date.split('-').map(Number); selectDate(new Date(year, month - 1, day)); }}><i className={`is-${meta.tone}`} /><span><strong>{event.title}</strong><small>{event.date.slice(8, 10)}.{event.date.slice(5, 7)} · {event.time}</small></span></button>;
                })}
              </div>
            </aside>
          </div>
        </>
      )}

      {error && events.length ? <div className="dashboard-calendar__inline-error">{error}</div> : null}
      {composerOpen ? <EventComposer draft={draft} setDraft={setDraft} onClose={() => setComposerOpen(false)} onSubmit={addEvent} /> : null}
    </DashboardCard>
  );
}

export default memo(Calendar);
