import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAccessControl from '../../access/hooks/useAccessControl';
import { REVIEW_SENTIMENT } from '../model/reviewData';
import ReviewQueue from './components/ReviewQueue';
import ReviewInspector from './components/ReviewInspector';
import ReviewsInsights from './components/ReviewsInsights';
import ReviewSettingsModal from './components/ReviewSettingsModal';
import useReviewsIntelligence from './hooks/useReviewsIntelligence';
import './ReviewsIntelligenceWorkspace.scss';

const QUEUES = [
  { id: 'attention', label: 'Требуют внимания' },
  { id: 'inbox', label: 'Все в работе' },
  { id: 'approval', label: 'Согласование' },
  { id: 'legal', label: 'Юристы' },
  { id: 'processed', label: 'Обработанные' },
];

const PLATFORMS = ['all', 'Яндекс', '2GIS', 'Ozon', 'Отзовик', 'WB'];

function ReviewsLoadingState() {
  return (
    <section className="reviews-intel-workspace reviews-intel-workspace--loading" aria-label="Загрузка отзывов">
      <div>{Array.from({ length: 6 }).map((_, index) => <i key={index} />)}</div>
      <div><b /><b /><b /><span /></div>
      <div><b /><b /><b /></div>
    </section>
  );
}

function ReviewsErrorState({ message, onRetry }) {
  return (
    <section className="reviews-intel-state">
      <span>!</span>
      <strong>Не удалось загрузить центр отзывов</strong>
      <p>{message || 'Проверьте соединение и повторите попытку.'}</p>
      <button type="button" onClick={onRetry}>Повторить</button>
    </section>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.7" /><path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" /><path d="M19 12a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.5 3.1h5l.5-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" /></svg>;
}

export default function ReviewsIntelligenceWorkspace() {
  const access = useAccessControl();
  const navigate = useNavigate();
  const intelligence = useReviewsIntelligence();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalReason, setLegalReason] = useState('В отзыве могут содержаться недостоверные утверждения или признаки нарушения правил площадки.');
  const [legalEvidenceNote, setLegalEvidenceNote] = useState('');

  const canReply = access.can('reviews.reply');
  const canApprove = access.can('reviews.approve');
  const canReanalyze = access.can('reviews.intelligence.reanalyze');
  const canLegal = access.can('reviews.legal') && intelligence.settings.legalEscalationEnabled;
  const canSettings = access.can('reviews.settings');
  const canCreateTask = access.can('tasks.create');

  const queueCounts = useMemo(() => ({
    attention: intelligence.reviews.filter((item) => item.sla?.overdue || item.sla?.progress >= 70 || ['approval', 'legal'].includes(item.workflowStatus)).length,
    inbox: intelligence.reviews.filter((item) => item.status !== 'done').length,
    approval: intelligence.reviews.filter((item) => item.workflowStatus === 'approval').length,
    legal: intelligence.reviews.filter((item) => item.workflowStatus === 'legal').length,
    processed: intelligence.reviews.filter((item) => item.workflowStatus === 'published').length,
  }), [intelligence.reviews]);

  const selectFilter = (key, value) => intelligence.setFilters((current) => ({ ...current, [key]: value }));

  const handleLegalSubmit = async () => {
    const evidence = ['Снимок текста отзыва и метаданных'];
    if (intelligence.selectedReview?.externalId) evidence.push(`ID площадки: ${intelligence.selectedReview.externalId}`);
    if (legalEvidenceNote.trim()) evidence.push(legalEvidenceNote.trim());
    const result = await intelligence.escalateLegal({ reason: legalReason, evidence });
    if (result) setLegalOpen(false);
  };

  return (
    <div className="reviews-intel-page">
      <section className="reviews-intel-hero">
        <div className="reviews-intel-hero__copy">
          <span className="reviews-intel-hero__eyebrow"><i /> REPUTATION OPERATIONS</span>
          <h1>Отзывы, которые требуют<br /><em>решения — сейчас.</em></h1>
          <p>Единый центр для подключённых источников: SLA, локальные черновики, согласование, причины негатива и юридическая эскалация.</p>
          <div className="reviews-intel-hero__mode">
            <span>Режим ответа</span>
            <strong>{intelligence.responseMode.label}</strong>
            <small>{intelligence.responseMode.description}</small>
          </div>
          <div className="reviews-intel-hero__links">
            {access.can('analytics.view') ? <button type="button" onClick={() => navigate('/reputation')}>Аналитика репутации <span>→</span></button> : null}
            {access.can('automations.view') ? <button type="button" onClick={() => navigate('/automations')}>Автоматизации <span>→</span></button> : null}
          </div>
        </div>

        <div className="reviews-intel-hero__pulse" aria-label="Репутационный пульс">
          <div className="reviews-pulse-ring">
            <svg viewBox="0 0 150 150" aria-hidden="true">
              <circle cx="75" cy="75" r="58" className="reviews-pulse-ring__track" />
              <circle cx="75" cy="75" r="58" pathLength="100" className="reviews-pulse-ring__value" strokeDasharray={`${Math.max(10, intelligence.metrics.responseCoverage)} 100`} />
            </svg>
            <div><strong>{intelligence.metrics.responseCoverage}%</strong><span>охват ответами</span></div>
            <i className="reviews-pulse-ring__orbit reviews-pulse-ring__orbit--one" />
            <i className="reviews-pulse-ring__orbit reviews-pulse-ring__orbit--two" />
          </div>
          <div className="reviews-intel-hero__signal">
            <span><i /> данные из вашего рабочего пространства</span>
            <strong>{intelligence.metrics.overdue ? `${intelligence.metrics.overdue} SLA требуют реакции` : 'Критических просрочек нет'}</strong>
          </div>
        </div>
      </section>

      <section className="reviews-intel-metrics" aria-label="Метрики отзывов">
        <article className="is-violet"><span>В работе</span><strong>{queueCounts.inbox}</strong><small>по доступным источникам</small><i /></article>
        <article className="is-red"><span>Негатив 1–3★</span><strong>{intelligence.metrics.negative}</strong><small>{intelligence.metrics.overdue ? `${intelligence.metrics.overdue} просрочено по SLA` : 'все в срок'}</small><i /></article>
        <article className="is-amber"><span>Согласование</span><strong>{intelligence.metrics.awaiting}</strong><small>ждут руководителя</small><i /></article>
        <article className="is-green"><span>Средний рейтинг</span><strong>{intelligence.metrics.average || '—'}</strong><small>по текущей выборке</small><i /></article>
      </section>

      <section className="reviews-intel-controlbar">
        <div className="reviews-intel-controlbar__queues" role="tablist" aria-label="Очереди">
          {QUEUES.map((queue) => (
            <button key={queue.id} type="button" className={intelligence.filters.queue === queue.id ? 'is-active' : ''} onClick={() => selectFilter('queue', queue.id)}>
              <span>{queue.label}</span><em>{queueCounts[queue.id] || 0}</em>
            </button>
          ))}
        </div>
        <div className="reviews-intel-controlbar__actions">
          <label className="reviews-intel-search"><SearchIcon /><input value={intelligence.query} onChange={(event) => intelligence.setQuery(event.target.value)} placeholder="Автор, текст, причина…" /></label>
          <select value={intelligence.filters.platform} onChange={(event) => selectFilter('platform', event.target.value)} aria-label="Площадка">
            {PLATFORMS.map((item) => <option key={item} value={item}>{item === 'all' ? 'Все площадки' : item}</option>)}
          </select>
          <select value={intelligence.filters.sentiment} onChange={(event) => selectFilter('sentiment', event.target.value)} aria-label="Тональность">
            <option value="all">Любая тональность</option>
            <option value={REVIEW_SENTIMENT.NEGATIVE}>Негатив</option>
            <option value={REVIEW_SENTIMENT.NEUTRAL}>Нейтрально</option>
            <option value={REVIEW_SENTIMENT.POSITIVE}>Позитив</option>
          </select>
          <select value={intelligence.filters.rating} onChange={(event) => selectFilter('rating', event.target.value)} aria-label="Оценка">
            <option value="all">Любая оценка</option>
            <option value="1">1★</option>
            <option value="2">2★</option>
            <option value="3">3★</option>
            <option value="4">4★</option>
            <option value="5">5★</option>
          </select>
          {canSettings ? <button type="button" className="reviews-intel-settingsBtn" onClick={() => setSettingsOpen(true)}><SettingsIcon /><span>Политика</span></button> : null}
        </div>
      </section>

      {intelligence.notice ? <div className={`reviews-intel-notice is-${intelligence.notice.tone}`}><span>{intelligence.notice.tone === 'success' ? '✓' : '!'}</span>{intelligence.notice.text}<button type="button" onClick={() => intelligence.setNotice(null)}>×</button></div> : null}

      {intelligence.loading ? <ReviewsLoadingState /> : null}
      {!intelligence.loading && intelligence.error ? <ReviewsErrorState message={intelligence.error} onRetry={intelligence.reload} /> : null}
      {!intelligence.loading && !intelligence.error ? (
        <section className="reviews-intel-workspace">
          <ReviewQueue reviews={intelligence.filtered} selectedId={intelligence.selectedId} onSelect={intelligence.selectReview} />
          <ReviewInspector
            review={intelligence.selectedReview}
            settings={intelligence.settings}
            canReply={canReply}
            canApprove={canApprove}
            working={intelligence.working}
            onGenerate={() => intelligence.generateDraft()}
            onSaveDraft={intelligence.saveDraft}
            onSubmit={intelligence.submitReply}
            onApprove={intelligence.approve}
            onRequestChanges={intelligence.requestChanges}
            onPublishApproved={intelligence.publishApproved}
            canReanalyze={canReanalyze}
            onReanalyze={intelligence.reanalyzeIntelligence}
          />
          <ReviewsInsights
            review={intelligence.selectedReview}
            reasonStats={intelligence.reasonStats}
            platformStats={intelligence.platformStats}
            onCreateTask={intelligence.ensureTask}
            onLegal={() => setLegalOpen(true)}
            canCreateTask={canCreateTask}
            canLegal={canLegal}
            working={intelligence.working}
          />
        </section>
      ) : null}
      {!intelligence.loading && !intelligence.error && intelligence.pagination.pages > 1 ? (
        <nav className="reviews-intel-pagination" aria-label="Страницы отзывов">
          <button type="button" disabled={intelligence.pagination.page <= 1} onClick={() => intelligence.goToPage(intelligence.pagination.page - 1)}>← Назад</button>
          <span>Страница {intelligence.pagination.page} из {intelligence.pagination.pages} · {intelligence.pagination.total} отзывов</span>
          <button type="button" disabled={intelligence.pagination.page >= intelligence.pagination.pages} onClick={() => intelligence.goToPage(intelligence.pagination.page + 1)}>Далее →</button>
        </nav>
      ) : null}

      <ReviewSettingsModal open={settingsOpen} settings={intelligence.settings} onClose={() => setSettingsOpen(false)} onSave={intelligence.updateSettings} />

      {legalOpen && intelligence.selectedReview ? (
        <div className="reviews-legal-layer" role="presentation">
          <button type="button" className="reviews-legal-layer__overlay" onClick={() => setLegalOpen(false)} aria-label="Закрыть" />
          <section className="reviews-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="reviews-legal-title">
            <span className="reviews-legal-dialog__icon">§</span>
            <div className="reviews-legal-dialog__copy">
              <span>LEGAL ESCALATION</span>
              <h2 id="reviews-legal-title">Передать отзыв на проверку?</h2>
              <p>Мы зафиксируем отзыв, соберём контекст и подготовим основания для обращения к площадке. Сам отзыв автоматически не удаляется.</p>
            </div>
            <label><span>Причина эскалации</span><textarea value={legalReason} onChange={(event) => setLegalReason(event.target.value)} rows={4} maxLength={500} /></label>
            <label><span>Дополнительное доказательство / контекст</span><textarea value={legalEvidenceNote} onChange={(event) => setLegalEvidenceNote(event.target.value)} rows={3} maxLength={500} placeholder="Например: номер заказа, ссылка на переписку, внутренний факт проверки…" /></label>
            <div className="reviews-legal-dialog__autofacts"><span>✓ Текст и метаданные отзыва будут зафиксированы</span><span>✓ ID площадки сохранится в кейсе</span></div>
            <div className="reviews-legal-dialog__steps"><span><i>1</i>Фиксация</span><span><i>2</i>Доказательства</span><span><i>3</i>Проверка правил</span><span><i>4</i>Обращение</span></div>
            <footer><button type="button" onClick={() => setLegalOpen(false)}>Отмена</button><button type="button" className="is-danger" onClick={handleLegalSubmit} disabled={Boolean(intelligence.working)}>Передать юристам</button></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
