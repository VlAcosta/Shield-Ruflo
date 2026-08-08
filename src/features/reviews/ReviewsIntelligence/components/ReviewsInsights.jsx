import React, { memo } from 'react';

function ReviewsInsights({ review, reasonStats, platformStats, onCreateTask, onLegal, canCreateTask, canLegal, working }) {
  if (!review) return null;
  const maxReason = Math.max(1, ...reasonStats.map((item) => item.count));

  return (
    <aside className="reviews-intel__sidecar" aria-label="Контекст отзыва">
      <section className={`reviews-sidecard reviews-sidecard--sla ${review.sla?.overdue ? 'is-overdue' : review.sla?.progress >= 70 ? 'is-risk' : ''}`}>
        <div className="reviews-sidecard__head">
          <span>SLA CONTROL</span>
          <em>{review.sla?.hours} ч</em>
        </div>
        <div className="reviews-sla-orbit" aria-hidden="true">
          <svg viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="39" className="reviews-sla-orbit__track" />
            <circle cx="48" cy="48" r="39" className="reviews-sla-orbit__value" pathLength="100" strokeDasharray={`${Math.min(100, review.sla?.progress || 0)} 100`} />
          </svg>
          <strong>{review.sla?.overdue ? '!' : `${Math.min(99, review.sla?.progress || 0)}%`}</strong>
        </div>
        <div className="reviews-sidecard__copy">
          <strong>{review.sla?.overdue ? 'Ответ просрочен' : review.sla?.progress >= 70 ? 'Требует внимания' : 'В пределах SLA'}</strong>
          <span>{review.sla?.overdue ? 'Нужно отреагировать как можно скорее.' : `Осталось ${review.sla?.remainingHours || 0} ч ${review.sla?.remainingMinutes || 0} мин.`}</span>
        </div>
      </section>

      <section className="reviews-sidecard">
        <div className="reviews-sidecard__head">
          <span>AI SIGNALS</span>
          <em>{(review.aiReasons || []).length}</em>
        </div>
        <div className="reviews-sidecard__reasons">
          {(review.aiReasons || review.tags || []).map((reason) => <span key={reason}>{reason}</span>)}
        </div>
        <p>Причины определяются автоматически и помогают находить повторяющиеся проблемы.</p>
      </section>

      <section className="reviews-sidecard">
        <div className="reviews-sidecard__head">
          <span>TOP REASONS</span>
          <em>30D</em>
        </div>
        <div className="reviews-reason-bars">
          {reasonStats.slice(0, 4).map((item) => (
            <div key={item.reason}>
              <span><b>{item.reason}</b><em>{item.count}</em></span>
              <i><b style={{ width: `${Math.round((item.count / maxReason) * 100)}%` }} /></i>
            </div>
          ))}
        </div>
      </section>

      <section className="reviews-sidecard reviews-sidecard--actions">
        <div className="reviews-sidecard__head">
          <span>ACTIONS</span>
        </div>
        <button type="button" onClick={onCreateTask} disabled={!canCreateTask || working.startsWith('task:')}>
          <span>+</span>
          <div><strong>{review.taskId ? 'Задача связана' : 'Создать задачу'}</strong><small>{review.taskId ? review.taskId : 'Передать проблему в работу'}</small></div>
        </button>
        <button type="button" className="is-danger" onClick={onLegal} disabled={!canLegal || working.startsWith('legal:')}>
          <span>§</span>
          <div><strong>{review.legalCase ? 'Юридическая проверка' : 'Спорный отзыв'}</strong><small>{review.legalCase?.status === 'precheck' ? 'Предварительная проверка идёт' : 'Открыть юридический кейс'}</small></div>
        </button>
      </section>

      <section className="reviews-sidecard reviews-sidecard--platforms">
        <div className="reviews-sidecard__head"><span>PLATFORMS</span><em>5</em></div>
        {platformStats.map((item) => (
          <div className="reviews-platform-row" key={item.platform}>
            <span>{item.platform}</span>
            <b>{item.count ? `${item.average} ★` : '—'}</b>
          </div>
        ))}
      </section>
    </aside>
  );
}

export default memo(ReviewsInsights);
