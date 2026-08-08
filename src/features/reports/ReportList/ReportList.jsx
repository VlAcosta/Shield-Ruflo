import React, { memo, useMemo, useState } from 'react';
import { ArrowIcon, DownloadIcon, FilterIcon, ReportIcon, SearchIcon } from '../model/icons';
import './ReportList.scss';

const STATUS_OPTIONS = Object.freeze([
  { id: 'all', label: 'Все статусы' },
  { id: 'ready', label: 'Готовы' },
  { id: 'processing', label: 'В обработке' },
]);

function StatusBadge({ status }) {
  return (
    <span className={`report-list__status report-list__status--${status}`}>
      <span />
      {status === 'processing' ? 'Обработка' : 'Готов'}
    </span>
  );
}

function ReportList({ reports, downloadId, onOpen, onDownload, canDownload = true }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return reports.filter((item) => {
      const matchesText = !normalized || [item.title, item.period, item.type]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized));
      const matchesStatus = status === 'all' || item.status === status;
      return matchesText && matchesStatus;
    });
  }, [query, reports, status]);

  return (
    <section className="report-list">
      <div className="report-list__toolbar">
        <label className="report-list__search">
          <SearchIcon />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск отчётов..." />
        </label>

        <div className="report-list__filter-wrap">
          <span className="report-list__filter-icon"><FilterIcon /></span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Статус отчётов">
            {STATUS_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      </div>

      <div className="report-list__surface">
        <div className="report-list__head" aria-hidden="true">
          <span>Название</span><span>Период</span><span>Дата</span><span>Размер</span><span>Статус</span><span />
        </div>

        <div className="report-list__rows">
          {filtered.map((item, index) => (
            <article className="report-list__row" key={item.id} style={{ '--report-index': index }}>
              <button type="button" className="report-list__primary" onClick={() => onOpen(item.id)}>
                <span className="report-list__icon"><ReportIcon /></span>
                <span className="report-list__copy">
                  <strong>{item.title}</strong>
                  <small>{item.type || 'Отчёт'}</small>
                </span>
              </button>

              <span className="report-list__cell">{item.period}</span>
              <span className="report-list__cell report-list__cell--numeric">{item.date}</span>
              <span className="report-list__cell report-list__cell--numeric">{item.size}</span>
              <span className="report-list__cell"><StatusBadge status={item.status} /></span>

              <div className="report-list__actions">
                <button
                  type="button"
                  className="report-list__action"
                  onClick={() => canDownload && onDownload(item)}
                  disabled={!canDownload || item.status !== 'ready' || downloadId === item.id}
                  title={!canDownload ? 'Нет права скачивать отчёты' : undefined}
                  aria-label={`Скачать ${item.title}`}
                >
                  <DownloadIcon />
                </button>
                <button type="button" className="report-list__action report-list__action--open" onClick={() => onOpen(item.id)} aria-label={`Открыть ${item.title}`}>
                  <ArrowIcon />
                </button>
              </div>
            </article>
          ))}
        </div>

        {!filtered.length ? (
          <div className="report-list__empty">
            <span><SearchIcon /></span>
            <strong>Ничего не найдено</strong>
            <p>Попробуйте изменить запрос или фильтр статуса.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default memo(ReportList);
