import React, { memo } from 'react';
import Button from '../../../components/ui/Button';
import { BackIcon, DownloadIcon } from '../model/icons';
import './ReportDetail.scss';

const FALLBACK_METRICS = Object.freeze([
  { id: 'rating', label: 'Общий рейтинг', value: '4.99', delta: '+0.12 за период', tone: 'violet' },
  { id: 'reviews', label: 'Отзывов получено', value: '247', delta: '+18% к прошлому', tone: 'cyan' },
  { id: 'answers', label: 'Ответов дано', value: '198', delta: '80.2% из всех', tone: 'green' },
  { id: 'tasks', label: 'Задач выполнено', value: '34/40', delta: '85% выполнение', tone: 'orange' },
]);

const FALLBACK_SECTIONS = Object.freeze([
  { id: 'platforms', title: 'Анализ отзывов по площадкам', subtitle: 'Сводка по источникам', kind: 'bars' },
  { id: 'rating-dynamics', title: 'Динамика рейтинга', subtitle: 'Изменение оценки', kind: 'line' },
  { id: 'tasks', title: 'Ключевые задачи', subtitle: 'Результаты периода', kind: 'tasks' },
  { id: 'recommendations', title: 'Рекомендации', subtitle: 'Следующие действия', kind: 'recommendations' },
]);

function MiniBars() {
  return <div className="report-detail__bars">{[48, 72, 56, 90, 68].map((value, index) => <span key={index} style={{ height: `${value}%` }} />)}</div>;
}

function MiniLine() {
  return (
    <svg className="report-detail__line" viewBox="0 0 320 110" preserveAspectRatio="none">
      <defs><linearGradient id="reportDetailLine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(102,97,245,.28)"/><stop offset="1" stopColor="rgba(102,97,245,0)"/></linearGradient></defs>
      <path d="M8 88 C46 82 64 66 94 70 S146 58 174 54 220 49 246 36 284 30 312 18 L312 108 L8 108Z" fill="url(#reportDetailLine)"/>
      <path d="M8 88 C46 82 64 66 94 70 S146 58 174 54 220 49 246 36 284 30 312 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function SectionVisual({ kind }) {
  if (kind === 'bars') return <MiniBars />;
  if (kind === 'line') return <MiniLine />;
  if (kind === 'tasks') return <div className="report-detail__task-lines"><span/><span/><span/></div>;
  return <div className="report-detail__recommendations"><span>01</span><p>Увеличить скорость ответа на негативные отзывы.</p><span>02</span><p>Сфокусироваться на Яндекс.Картах и 2GIS.</p></div>;
}

function ReportDetail({ report, downloadBusy, onBack, onDownload, canDownload = true }) {
  if (!report) return null;

  const metrics = report.metrics || FALLBACK_METRICS;
  const sections = report.sections || FALLBACK_SECTIONS;

  return (
    <div className="report-detail">
      <button type="button" className="report-detail__back" onClick={onBack}><BackIcon /> Назад к списку</button>

      <section className="report-detail__hero">
        <div>
          <span className="report-detail__period">{report.period}</span>
          <h2>{report.title}</h2>
          <p>{report.description || 'Готовый аналитический отчёт по выбранному периоду.'}</p>
          <div className="report-detail__meta"><span>{report.date}</span><i/><span>{report.size}</span></div>
        </div>

        <Button className="report-detail__download" onClick={() => canDownload && onDownload(report)} disabled={!canDownload || downloadBusy || report.status !== 'ready'} title={!canDownload ? 'Нет права скачивать отчёты' : undefined}>
          <DownloadIcon /> {downloadBusy ? 'Подготовка...' : 'Скачать PDF'}
        </Button>
      </section>

      <section className="report-detail__metrics">
        {metrics.map((item, index) => (
          <article className={`report-detail__metric report-detail__metric--${item.tone}`} key={item.id} style={{ '--metric-index': index }}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.delta}</small>
          </article>
        ))}
      </section>

      <section className="report-detail__sections">
        {sections.map((item, index) => (
          <article className="report-detail__section" key={item.id} style={{ '--section-index': index }}>
            <div className="report-detail__section-head"><div><h3>{item.title}</h3><span>{item.subtitle}</span></div><button type="button" aria-label={`Подробнее: ${item.title}`}>•••</button></div>
            <div className="report-detail__section-body"><SectionVisual kind={item.kind} /></div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default memo(ReportDetail);
