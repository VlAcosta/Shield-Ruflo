import React, { memo, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import { CHANNEL_ICON_MAP, CalendarIcon, ClockIcon } from '../model/icons';
import { DELIVERY_CHANNELS, WEEK_DAYS } from '../model/reportData';
import './ReportSchedule.scss';

function ReportSchedule({ schedules, saving, onSave }) {
  const [draft, setDraft] = useState(() => schedules.map((item) => ({ ...item })));
  const [day, setDay] = useState('mon');
  const [time, setTime] = useState('09:00');
  const [channel, setChannel] = useState('email');
  const [title, setTitle] = useState('Еженедельный отчёт');
  const [destination, setDestination] = useState('');

  const scheduleSignature = JSON.stringify(schedules);
  useEffect(() => {
    setDraft(schedules.map((item) => ({ ...item })));
  }, [scheduleSignature, schedules]);

  const changed = useMemo(() => JSON.stringify(draft) !== scheduleSignature, [draft, scheduleSignature]);
  const trimmedDestination = destination.trim();
  const canAdd = channel !== 'telegram' || Boolean(trimmedDestination);

  const toggleSchedule = (id) => {
    setDraft((current) => current.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
  };

  const addSchedule = () => {
    if (!canAdd) return;
    const dayMeta = WEEK_DAYS.find((item) => item.id === day);
    const channelMeta = DELIVERY_CHANNELS.find((item) => item.id === channel);
    setDraft((current) => [
      ...current,
      {
        id: `schedule-${Date.now()}`,
        title: title.trim() || 'Автоматический отчёт',
        day,
        dayLabel: dayMeta?.label || 'Пн',
        time,
        channel,
        channelLabel: channelMeta?.label || 'Email',
        ...(trimmedDestination ? { destination: trimmedDestination } : {}),
        enabled: true,
      },
    ]);
    setDestination('');
  };

  return (
    <div className="report-schedule">
      <section className="report-schedule__form">
        <div className="report-schedule__head"><span>Автоматизация</span><h2>Расписание автоотправки</h2><p>Настройте регулярную доставку отчётов без ручного запуска.</p></div>

        <label className="report-schedule__field report-schedule__field--title"><span>Название</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>

        <div className="report-schedule__field"><span>День недели</span><div className="report-schedule__days">{WEEK_DAYS.map((item) => <button key={item.id} type="button" className={day === item.id ? 'is-active' : ''} onClick={() => setDay(item.id)}>{item.label}</button>)}</div></div>

        <div className="report-schedule__row">
          <label className="report-schedule__field"><span>Время</span><div className="report-schedule__input-icon"><ClockIcon/><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div></label>
          <div className="report-schedule__field"><span>Канал доставки</span><div className="report-schedule__channels">{DELIVERY_CHANNELS.map((item) => { const Icon = CHANNEL_ICON_MAP[item.id]; return <button key={item.id} type="button" className={channel === item.id ? 'is-active' : ''} onClick={() => { setChannel(item.id); setDestination(''); }}>{Icon ? <Icon/> : null}{item.label}</button>; })}</div></div>
        </div>

        <label className="report-schedule__field report-schedule__field--title">
          <span>{channel === 'telegram' ? 'Telegram destination' : 'Email для доставки'}</span>
          <input
            type={channel === 'email' ? 'email' : 'text'}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder={channel === 'telegram' ? '@channelusername или chat ID' : 'Необязательно — используем email владельца'}
            required={channel === 'telegram'}
          />
          {channel === 'telegram' && !trimmedDestination ? <small>Для Telegram нужен chat ID или @channelusername.</small> : null}
        </label>

        <Button className="report-schedule__add" variant="outline" onClick={addSchedule} disabled={!canAdd}>+ Добавить расписание</Button>
      </section>

      <section className="report-schedule__list">
        <div className="report-schedule__list-head"><div><span>Активные расписания</span><strong>{draft.filter((item) => item.enabled).length} включено</strong></div><Button onClick={() => onSave(draft)} disabled={!changed || saving}>{saving ? 'Сохраняем...' : 'Сохранить изменения'}</Button></div>

        <div className="report-schedule__items">
          {draft.map((item, index) => {
            const Icon = CHANNEL_ICON_MAP[item.channel] || CalendarIcon;
            const destinationLabel = item.destination || (item.channel === 'email' ? 'email владельца' : 'destination не указан');
            return (
              <article className={`report-schedule__item ${item.enabled ? 'is-enabled' : ''}`} key={item.id} style={{ '--schedule-index': index }}>
                <span className="report-schedule__item-icon"><Icon/></span>
                <div className="report-schedule__item-copy"><strong>{item.title}</strong><span>{item.dayLabel}, {item.time} · {item.channelLabel} · {destinationLabel}</span></div>
                <button type="button" className={`report-schedule__switch ${item.enabled ? 'is-on' : ''}`} role="switch" aria-checked={item.enabled} onClick={() => toggleSchedule(item.id)}><span/></button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default memo(ReportSchedule);
