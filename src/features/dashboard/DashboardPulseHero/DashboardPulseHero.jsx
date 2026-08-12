import React, { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import useDashboardData from '../hooks/useDashboardData';
import AnimatedValue from '../components/AnimatedValue';
import './DashboardPulseHero.scss';

function buildSparkPath(values = []) {
  const safe = Array.isArray(values) && values.length > 1 ? values : [0, 0];
  const width = 260;
  const height = 72;
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = Math.max(1, max - min);
  return safe.map((value, index) => {
    const x = (index / (safe.length - 1)) * width;
    const y = height - 7 - ((value - min) / range) * (height - 18);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.3L18.2 5.7V10.9C18.2 15.3 15.6 18.4 12 20.2C8.4 18.4 5.8 15.3 5.8 10.9V5.7L12 3.3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.1 11.8L11.2 13.8L15.2 9.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8H12.5M9 4.5L12.5 8L9 11.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DashboardPulseHero({ organizationName }) {
  const navigate = useNavigate();
  const { data, status, source, apiEnabled, refreshing } = useDashboardData();
  const pulse = data?.pulse;
  const loading = status === 'loading' && !pulse;
  const sparkPath = useMemo(() => buildSparkPath(pulse?.spark), [pulse?.spark]);
  const score = Number(pulse?.score || 0);
  const measured = Boolean(pulse?.measured);
  const signals = Array.isArray(pulse?.signals) ? pulse.signals : [];
  const sourceState = useMemo(() => {
    if (status === 'offline') return { label: 'НЕТ СВЯЗИ', tone: 'offline' };
    if (source === 'local-demo') return { label: 'ДЕМО', tone: 'demo' };
    if (!apiEnabled || source === 'local') return { label: 'ЛОКАЛЬНО', tone: 'local' };
    if (status === 'stale' || refreshing) return { label: 'СИНХРОНИЗАЦИЯ', tone: 'sync' };
    return { label: 'ОНЛАЙН', tone: 'live' };
  }, [apiEnabled, refreshing, source, status]);

  return (
    <section className={`dashboard-pulse-hero ${loading ? 'is-loading' : ''}`} aria-label="Состояние репутации" aria-busy={loading || refreshing}>
      <div className="dashboard-pulse-hero__ambient" aria-hidden="true"><i className="is-one" /><i className="is-two" /><i className="is-three" /></div>

      <div className="dashboard-pulse-hero__copy">
        <div className="dashboard-pulse-hero__eyebrow">
          <span className={`dashboard-pulse-hero__live is-${sourceState.tone}`}><i /> {sourceState.label}</span>
          <span>ЦЕНТР РЕПУТАЦИИ</span>
        </div>
        <h2>Репутация под контролем</h2>
        <p>{organizationName || 'Компания'} — единый центр собирает рейтинг, отзывы, задачи и состояние подключённых площадок.</p>
        <div className="dashboard-pulse-hero__actions">
          <button type="button" className="dashboard-pulse-hero__primary" onClick={() => navigate('/reviews')}>Перейти к отзывам <ArrowIcon /></button>
          <button type="button" className="dashboard-pulse-hero__secondary" onClick={() => navigate('/reports')}>Открыть отчёты</button>
        </div>
      </div>

      <div className="dashboard-pulse-hero__signal">
        <div className="dashboard-pulse-hero__signal-head">
          <div><span>Репутационный пульс</span><strong>{loading ? 'Собираем данные…' : pulse?.status || 'Недостаточно данных'}</strong></div>
          <span className="dashboard-pulse-hero__shield"><ShieldIcon /></span>
        </div>

        <div className="dashboard-pulse-hero__spark">
          {loading ? <div className="dashboard-pulse-hero__spark-skeleton" /> : pulse?.spark?.length > 1 ? (
            <svg viewBox="0 0 260 72" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="dashboardPulseArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8d65ff" stopOpacity=".28" /><stop offset="100%" stopColor="#8d65ff" stopOpacity="0" /></linearGradient></defs>
              <path className="dashboard-pulse-hero__spark-area" d={`${sparkPath} L 260 72 L 0 72 Z`} />
              <path className="dashboard-pulse-hero__spark-line" d={sparkPath} />
            </svg>
          ) : <div className="dashboard-pulse-hero__spark-empty"><span>История появится после первых синхронизаций</span></div>}
          <div className="dashboard-pulse-hero__score"><strong>{loading || !measured ? '—' : <AnimatedValue value={score} formatter={(value) => String(Math.round(value))} />}</strong><span>/100</span><small>индекс здоровья</small></div>
        </div>

        <div className="dashboard-pulse-hero__signals">
          {loading ? Array.from({ length: 3 }, (_, index) => <div className="dashboard-pulse-hero__signal-card is-loading" key={index} />) : signals.length ? signals.map((signal) => (
            <div className={`dashboard-pulse-hero__signal-card is-${signal.tone || 'violet'}`} key={signal.id}>
              <span>{signal.label}</span><strong>{signal.value}</strong><small>{signal.caption}</small>
            </div>
          )) : <div className="dashboard-pulse-hero__signal-empty">Подключите площадки и начните получать отзывы — показатели появятся автоматически.</div>}
        </div>
      </div>
    </section>
  );
}

export default memo(DashboardPulseHero);
