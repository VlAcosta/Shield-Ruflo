import React, { memo } from 'react';
import { REVIEW_SENTIMENT, REVIEW_WORKFLOW } from '../../model/reviewData';

const PLATFORM_SHORT = {
  'Яндекс': 'Я',
  '2GIS': '2G',
  'Ozon': 'OZ',
  'Отзовик': 'ОТ',
  'WB': 'WB',
};

const WORKFLOW_LABEL = {
  [REVIEW_WORKFLOW.INBOX]: 'Входящий',
  [REVIEW_WORKFLOW.DRAFT]: 'Черновик',
  [REVIEW_WORKFLOW.APPROVAL]: 'Согласование',
  [REVIEW_WORKFLOW.APPROVED]: 'Согласован',
  [REVIEW_WORKFLOW.SHIELD]: 'Бизнес Щит',
  [REVIEW_WORKFLOW.PUBLISHED]: 'Опубликован',
  [REVIEW_WORKFLOW.LEGAL]: 'Юристы',
};

function formatSla(sla) {
  if (sla?.overdue) return 'SLA просрочен';
  if (!sla) return '';
  if (sla.remainingHours > 0) return `${sla.remainingHours}ч ${sla.remainingMinutes}м`;
  return `${Math.max(1, sla.remainingMinutes)} мин`;
}

function ReviewQueue({ reviews, selectedId, onSelect }) {
  return (
    <section className="reviews-intel__queue" aria-label="Очередь отзывов">
      <div className="reviews-intel__queueHead">
        <div>
          <span>LIVE QUEUE</span>
          <strong>{reviews.length} отзывов</strong>
        </div>
        <i className="reviews-intel__liveDot" aria-hidden="true" />
      </div>

      <div className="reviews-intel__queueList">
        {!reviews.length ? (
          <div className="reviews-intel__queueEmpty">
            <span>✓</span>
            <strong>Очередь пуста</strong>
            <small>Для выбранных фильтров ничего не требует внимания.</small>
          </div>
        ) : null}
        {reviews.map((review, index) => {
          const selected = review.id === selectedId;
          const negative = review.sentiment === REVIEW_SENTIMENT.NEGATIVE;
          return (
            <button
              key={review.id}
              type="button"
              className={`reviews-intel-card ${selected ? 'is-selected' : ''} is-${review.sentiment}`}
              onClick={() => onSelect(review.id)}
              aria-pressed={selected}
              style={{ '--review-delay': `${Math.min(index, 7) * 32}ms` }}
            >
              <span className={`reviews-intel-card__platform is-${String(review.platform).toLowerCase().replace(/[^a-z0-9а-я]+/gi, '-')}`}>
                {PLATFORM_SHORT[review.platform] || review.platform.slice(0, 2)}
              </span>
              <span className="reviews-intel-card__body">
                <span className="reviews-intel-card__top">
                  <strong>{review.author}</strong>
                  <small>{review.date} · {review.time}</small>
                </span>
                <span className="reviews-intel-card__rating">
                  <b>{review.rating}.0 ★</b>
                  <em className={`is-${review.sentiment}`}>
                    {review.sentiment === REVIEW_SENTIMENT.NEGATIVE ? 'Негатив' : review.sentiment === REVIEW_SENTIMENT.NEUTRAL ? 'Нейтрально' : 'Позитив'}
                  </em>
                </span>
                <span className="reviews-intel-card__text">{review.text}</span>
                <span className="reviews-intel-card__footer">
                  <span className={`reviews-intel-card__workflow is-${review.workflowStatus}`}>{WORKFLOW_LABEL[review.workflowStatus] || 'В работе'}</span>
                  <span className={`reviews-intel-card__sla ${review.sla?.overdue ? 'is-overdue' : negative && review.sla?.progress >= 70 ? 'is-risk' : ''}`}>
                    {formatSla(review.sla)}
                  </span>
                </span>
                <span className="reviews-intel-card__slaTrack" aria-hidden="true">
                  <i style={{ width: `${Math.max(5, review.sla?.progress || 0)}%` }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default memo(ReviewQueue);
