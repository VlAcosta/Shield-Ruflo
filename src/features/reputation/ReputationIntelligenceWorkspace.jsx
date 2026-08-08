import React from 'react';
import { useNavigate } from 'react-router-dom';
import useAccessControl from '../access/hooks/useAccessControl';
import useReputationIntelligence from './hooks/useReputationIntelligence';
import ReputationTrendChart from './components/ReputationTrendChart';
import InsightFeed from './components/InsightFeed';
import PlatformMatrix from './components/PlatformMatrix';
import ReasonMomentum from './components/ReasonMomentum';
import RecommendationStack from './components/RecommendationStack';
import './ReputationIntelligenceWorkspace.scss';

const periods = [{ value: 7, label: '7 дней' }, { value: 30, label: '30 дней' }, { value: 90, label: '90 дней' }];

function signed(value, suffix = '') { return `${value > 0 ? '+' : ''}${value}${suffix}`; }

export default function ReputationIntelligenceWorkspace() {
  const navigate = useNavigate();
  const access = useAccessControl();
  const { data, loading, error, days, setDays, reload } = useReputationIntelligence();

  if (loading && !data) return <div className="rep-page rep-page--loading"><div className="rep-skeleton rep-skeleton--hero" /><div className="rep-skeleton-grid">{Array.from({ length: 4 }).map((_, i) => <i key={i} />)}</div><div className="rep-skeleton rep-skeleton--body" /></div>;
  if (error && !data) return <div className="rep-page"><section className="rep-state"><span>!</span><h2>Не удалось собрать репутационную аналитику</h2><p>{error}</p><button type="button" onClick={() => reload()}>Повторить</button></section></div>;
  if (!data) return null;

  const handleInsight = (item) => {
    if (item.route) navigate(item.route);
    else if (item.automationTemplate) navigate(`/automations?template=${item.automationTemplate}`);
  };

  return (
    <div className="rep-page">
      <section className="rep-hero">
        <div className="rep-hero__copy"><span className="rep-eyebrow"><i /> REPUTATION INTELLIGENCE</span><h1>Не просто графики.<br /><em>Причины и действия.</em></h1><p>Бизнес Щит связывает рейтинг, негатив, скорость ответа и причины жалоб — и показывает директору, что изменилось и что делать дальше.</p><div className="rep-periods">{periods.map((item) => <button type="button" key={item.value} className={days === item.value ? 'is-active' : ''} onClick={() => setDays(item.value)}>{item.label}</button>)}</div></div>
        <div className="rep-health"><div className="rep-health__ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="70" className="rep-health__track" /><circle cx="90" cy="90" r="70" pathLength="100" strokeDasharray={`${data.health} 100`} className="rep-health__value" /></svg><div><strong>{data.health}</strong><span>/100</span></div><i className="rep-health__orbit is-one" /><i className="rep-health__orbit is-two" /></div><div className="rep-health__copy"><span><i /> система наблюдает</span><strong>{data.health >= 80 ? 'Репутация стабильна' : data.health >= 60 ? 'Есть зоны внимания' : 'Нужна реакция'}</strong><small>Индекс учитывает рейтинг, негатив, ответы и SLA</small></div></div>
      </section>

      <section className="rep-kpis">
        <article className="is-violet"><span>Рейтинг</span><strong>{data.current.rating || '—'}</strong><em className={data.deltas.rating >= 0 ? 'is-up' : 'is-down'}>{signed(data.deltas.rating)}</em><small>к предыдущему периоду</small></article>
        <article className="is-red"><span>Доля негатива</span><strong>{data.current.negativeShare}%</strong><em className={data.deltas.negativeShare <= 0 ? 'is-up' : 'is-down'}>{signed(data.deltas.negativeShare, ' п.п.')}</em><small>1–3★</small></article>
        <article className="is-green"><span>Охват ответами</span><strong>{data.current.responseCoverage}%</strong><em className={data.deltas.responseCoverage >= 0 ? 'is-up' : 'is-down'}>{signed(data.deltas.responseCoverage, ' п.п.')}</em><small>обработанных отзывов</small></article>
        <article className="is-amber"><span>Средняя реакция</span><strong>{data.current.avgResponseHours || '—'}{data.current.avgResponseHours ? ' ч' : ''}</strong><em className={data.deltas.avgResponseHours <= 0 ? 'is-up' : 'is-down'}>{signed(data.deltas.avgResponseHours, ' ч')}</em><small>{data.current.slaBreaches} SLA просрочено</small></article>
      </section>

      <section className="rep-grid rep-grid--top">
        <article className="rep-card rep-card--trend"><header><div><span>ДИНАМИКА</span><h2>Пульс рейтинга</h2></div><small>{data.current.count} отзывов за период</small></header><ReputationTrendChart data={data.trend} /></article>
        <article className="rep-card rep-card--insights"><header><div><span>SMART INSIGHTS</span><h2>Что изменилось</h2></div><i className="rep-live">LIVE</i></header><InsightFeed insights={data.insights} onAction={handleInsight} /></article>
      </section>

      <section className="rep-card rep-card--platforms"><header><div><span>КАНАЛЫ</span><h2>Где формируется репутация</h2></div><small>Яндекс · 2GIS · Ozon · Отзовик · WB</small></header><PlatformMatrix items={data.platforms} /></section>

      <section className="rep-grid rep-grid--bottom">
        <article className="rep-card"><header><div><span>ПРИЧИНЫ НЕГАТИВА</span><h2>Что раздражает клиентов</h2></div><small>сравнение с прошлым периодом</small></header><ReasonMomentum reasons={data.reasons} /></article>
        <article className="rep-card"><header><div><span>NEXT BEST ACTION</span><h2>Что сделать сейчас</h2></div><button type="button" className="rep-link" onClick={() => navigate('/automations')}>Все автоматизации →</button></header><RecommendationStack items={data.recommendations} onCreateAutomation={access.can('automations.manage') ? (template) => navigate(`/automations?template=${template}`) : null} /></article>
      </section>
    </div>
  );
}
