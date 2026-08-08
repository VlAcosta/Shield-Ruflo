import React, { memo, useCallback, useMemo, useState } from 'react';
import PeriodMenu from '../../../components/ui/PeriodMenu';
import useDashboardData from '../hooks/useDashboardData';
import AnimatedValue from '../components/AnimatedValue';
import tasksImg from './assets/tasks.svg';
import ratingImg from './assets/rating.svg';
import reviewImg from './assets/review.svg';
import supportImg from './assets/support.svg';
import subscriptionImg from './assets/subscription.svg';
import inActiveImg from './assets/inActive.svg';
import './HeaderAnalytick.scss';

const REVIEW_PERIODS = Object.freeze([
  { value: 'day', label: 'за сегодня', caption: 'Текущие сутки' },
  { value: 'week', label: 'за неделю', caption: 'Последние 7 дней' },
  { value: 'month', label: 'за месяц', caption: 'Текущий месяц' },
  { value: 'year', label: 'за год', caption: 'Последние 12 месяцев' },
  { value: 'all', label: 'за всё время', caption: 'Вся история' },
]);

const numberFormatter = new Intl.NumberFormat('ru-RU');

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function buildSpark(values = []) {
  const safe = Array.isArray(values) && values.length > 1 ? values : [0, 0];
  const width = 74;
  const height = 28;
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = Math.max(1, max - min);
  return safe.map((value, index) => {
    const x = (index / (safe.length - 1)) * width;
    const y = height - 3 - ((value - min) / range) * (height - 7);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function Sparkline({ values }) {
  const hasData = Array.isArray(values) && values.length > 1;
  const path = useMemo(() => buildSpark(values), [values]);
  if (!hasData) return <span className="header-analytics__spark-empty" aria-hidden="true" />;
  return <svg className="header-analytics__spark" viewBox="0 0 74 28" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>;
}

function MetricCard({ id, label, value, icon, tone, caption, trend, children, valueClassName = '', spark = [], loading = false }) {
  return (
    <article className={`header-analytics__card header-analytics__card--${tone} ${loading ? 'is-loading' : ''}`} data-metric={id}>
      <div className="header-analytics__accent" aria-hidden="true" />
      <div className="header-analytics__top">
        <div className="header-analytics__heading">
          <span className={`header-analytics__icon header-analytics__icon--${tone}`}><img src={icon} alt="" aria-hidden="true" /></span>
          <span className="header-analytics__label">{label}</span>
        </div>
        {loading ? <span className="header-analytics__spark-placeholder" /> : <Sparkline values={spark} />}
      </div>
      <div className="header-analytics__main">
        {loading ? <span className="header-analytics__value-placeholder" /> : value !== undefined ? <strong className={`header-analytics__value ${valueClassName}`.trim()}>{value}</strong> : null}
        {!loading ? children : null}
      </div>
      {!loading && (caption || trend) ? (
        <div className="header-analytics__footer">
          {trend ? <span className={`header-analytics__trend is-${trend.tone || 'positive'}`}>{trend.label}</span> : <span />}
          {caption ? <small>{caption}</small> : null}
        </div>
      ) : null}
    </article>
  );
}

function HeaderAnalytick({ firstRun = false, connectedCount = 0 }) {
  const [selectedPeriod, setSelectedPeriod] = useState('day');
  const { data, status } = useDashboardData();
  const metrics = data?.metrics;
  const loading = !firstRun && status === 'loading' && !metrics;

  const currentReviewsValue = useMemo(() => {
    if (firstRun) return 0;
    return Number(metrics?.reviews?.byPeriod?.[selectedPeriod] ?? metrics?.reviews?.value ?? 0) || 0;
  }, [firstRun, metrics, selectedPeriod]);
  const currentReviewsText = numberFormatter.format(currentReviewsValue);

  const handlePeriodChange = useCallback((nextPeriod) => setSelectedPeriod(nextPeriod), []);
  const taskTrend = metrics?.tasks?.trend ? { label: `${metrics.tasks.trend.value > 0 ? '+' : ''}${metrics.tasks.trend.value}%`, tone: metrics.tasks.trend.tone } : null;
  const ratingTrend = metrics?.rating?.trend ? { label: `${metrics.rating.trend.value > 0 ? '+' : ''}${metrics.rating.trend.value}%`, tone: metrics.rating.trend.tone } : null;
  const ratingValue = metrics?.rating?.value ? Number(metrics.rating.value) : null;
  const subscriptionValue = metrics?.subscription?.activeUntil ? formatDate(metrics.subscription.activeUntil) : '—';

  return (
    <section className="header-analytics" aria-label="Ключевые показатели">
      <MetricCard id="tasks" label="Задачи" value={firstRun ? '0' : <AnimatedValue value={metrics?.tasks?.value ?? 0} formatter={(value) => String(Math.round(value))} />} icon={tasksImg} tone="violet" trend={firstRun ? null : taskTrend} caption={firstRun ? 'создайте первую задачу' : metrics?.tasks?.caption} spark={metrics?.tasks?.spark} loading={loading} />
      <MetricCard id="rating" label="Рейтинг" value={firstRun ? '—' : <AnimatedValue value={ratingValue} formatter={(value) => value.toFixed(2)} />} icon={ratingImg} tone="yellow" trend={firstRun ? null : ratingTrend} caption={firstRun ? 'ожидаем данные' : metrics?.rating?.caption} spark={metrics?.rating?.spark} loading={loading} />

      <MetricCard id="reviews" label="Новые отзывы" icon={reviewImg} tone="purple" trend={null} spark={metrics?.reviews?.spark} loading={loading}>
        <strong className={`header-analytics__value header-analytics__value--reviews ${currentReviewsText.length > 7 ? 'is-compact' : ''}`}><AnimatedValue value={currentReviewsValue} formatter={(value) => numberFormatter.format(Math.round(value))} /></strong>
        {firstRun ? <span className="header-analytics__fresh-note">ожидаем первые данные</span> : (
          <PeriodMenu className="header-analytics__period" value={selectedPeriod} options={REVIEW_PERIODS} onChange={handlePeriodChange} variant="quiet" align="left" ariaLabel="Период новых отзывов" />
        )}
      </MetricCard>

      <MetricCard id="shield" label="Бизнес Щит" icon={inActiveImg} tone="green" caption={metrics?.shield?.caption || 'мониторинг'} spark={metrics?.shield?.spark} loading={loading}>
        <strong className="header-analytics__status"><span className="header-analytics__status-dot" aria-hidden="true" />{firstRun ? 'готов к мониторингу' : metrics?.shield?.active ? 'защита активна' : 'ожидает подключения'}</strong>
      </MetricCard>

      <MetricCard id="support" label="Поддержка" icon={supportImg} tone="cyan" caption={metrics?.support?.responseMinutes ? `ответ ~ ${metrics.support.responseMinutes} мин` : 'каналы связи'} spark={metrics?.support?.spark} loading={loading}>
        <strong className="header-analytics__support-status"><span className="header-analytics__support-dot" aria-hidden="true" />{metrics?.support?.channelsOnline || 0} канал(а) доступно</strong>
      </MetricCard>

      <MetricCard id="subscription" label={firstRun ? 'Подключено площадок' : 'Подписка до'} value={firstRun ? String(connectedCount) : subscriptionValue} valueClassName={firstRun ? '' : 'header-analytics__value--date'} icon={subscriptionImg} tone="blue" caption={firstRun ? 'источников данных' : metrics?.subscription?.status === 'expired' ? 'требует продления' : metrics?.subscription?.activeUntil ? (metrics?.subscription?.planName || 'активна') : `${metrics?.subscription?.connectedCount || 0} площадок`} spark={metrics?.subscription?.spark} loading={loading} />
    </section>
  );
}

export default memo(HeaderAnalytick);
