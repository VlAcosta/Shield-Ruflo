import React, {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CircleCheckIcon,
  ClockIcon,
  CloseIcon,
  FilterIcon,
  SearchIcon,
} from '../icons';
import useReviews from '../../../features/reviews/hooks/useReviews';
import {
  REVIEW_PLATFORMS,
  REVIEW_RATINGS,
  REVIEW_REPLY_TEMPLATES,
  REVIEW_STATUS,
  REVIEW_TABS,
} from '../../../features/reviews/model/reviewData';
import './PortalReviewsDrawer.scss';
import useAccessControl from '../../../features/access/hooks/useAccessControl';
import { readReviewSettings } from '../../../services/reviews/reviewIntelligenceService';

const PAGE_SIZE = 10;

function makeStars(rating) {
  return Array.from({ length: 5 }, (_, index) => index < rating);
}

function formatCount(value) {
  if (value === 1) return '1 отзыв';
  if (value > 1 && value < 5) return `${value} отзыва`;
  return `${value} отзывов`;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12L19 5L14 19L11 13L5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M11 13L15 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ArrowBackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 7L10 12L15 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReviewCard({ review, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`portal-review-card ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(review.id)}
      aria-pressed={selected}
    >
      <span className={`portal-review-card__avatar portal-review-card__avatar--${review.rating <= 3 ? 'negative' : review.rating === 4 ? 'neutral' : 'positive'}`}>
        {review.initials}
      </span>

      <span className="portal-review-card__body">
        <span className="portal-review-card__top">
          <span className="portal-review-card__author">{review.author}</span>
          <span className="portal-review-card__platform">{review.platform}</span>
        </span>

        <span className="portal-review-card__rating">
          <span className="portal-review-stars" aria-label={`${review.rating} из 5`}>
            {makeStars(review.rating).map((filled, index) => (
              <i key={index} className={filled ? 'is-filled' : ''}>★</i>
            ))}
          </span>
          <span>{review.date}</span>
        </span>

        <span className="portal-review-card__text">{review.text}</span>

        <span className="portal-review-card__footer">
          <span>{review.source}</span>
          {review.status === REVIEW_STATUS.DEFERRED ? <em>Отложен</em> : null}
          {review.status === REVIEW_STATUS.DONE ? <em className="is-done">Обработан</em> : null}
        </span>
      </span>
    </button>
  );
}

const MemoReviewCard = memo(ReviewCard);

function ReviewsSkeleton() {
  return (
    <div className="portal-reviews-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="portal-reviews-skeleton__item" key={index}>
          <i />
          <span>
            <b />
            <b />
            <b />
          </span>
        </div>
      ))}
    </div>
  );
}

function PortalReviewsDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const access = useAccessControl();
  const canReply = access.can('reviews.reply');
  const reviewPolicy = readReviewSettings();
  const canReplyDirectly = canReply && reviewPolicy.responseMode === 'client';
  const canModerate = access.can('reviews.moderate');
  const closeRef = useRef(null);
  const {
    reviews,
    loading,
    error,
    stats,
    reload,
    patchReview,
    replyToReview,
  } = useReviews();

  const [activeTab, setActiveTab] = useState(REVIEW_STATUS.NEW);
  const [platform, setPlatform] = useState('Все площадки');
  const [rating, setRating] = useState('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);

  const counts = useMemo(() => reviews.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {}), [reviews]);

  const filteredReviews = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return reviews.filter((item) => {
      if (item.status !== activeTab) return false;
      if (platform !== 'Все площадки' && item.platform !== platform) return false;
      if (rating !== 'all' && String(item.rating) !== rating) return false;

      if (!normalizedQuery) return true;

      return [item.author, item.text, item.platform, item.source, ...(item.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeTab, deferredQuery, platform, rating, reviews]);

  const visibleReviews = useMemo(
    () => filteredReviews.slice(0, visibleCount),
    [filteredReviews, visibleCount]
  );

  const selectedReview = useMemo(() => (
    reviews.find((item) => item.id === selectedId) || null
  ), [reviews, selectedId]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, deferredQuery, platform, rating]);

  useEffect(() => {
    if (!filteredReviews.length) {
      setSelectedId(null);
      setReplyText('');
      return;
    }

    const stillVisible = filteredReviews.some((item) => item.id === selectedId);
    if (!stillVisible) setSelectedId(filteredReviews[0].id);
  }, [filteredReviews, selectedId]);

  useEffect(() => {
    setReplyText(selectedReview?.reply || '');
  }, [selectedReview?.id, selectedReview?.reply]);

  const handleSelect = useCallback((reviewId) => {
    setSelectedId(reviewId);
    setMobileDetail(true);
  }, []);

  const handleStatusChange = useCallback(async (status) => {
    if (!selectedReview || saving || !canModerate) return;
    setSaving(true);
    try {
      await patchReview(selectedReview.id, { status });
    } finally {
      setSaving(false);
    }
  }, [canModerate, patchReview, saving, selectedReview]);

  const handleReply = useCallback(async () => {
    const text = replyText.trim();
    if (!selectedReview || !text || saving || !canReplyDirectly) return;

    setSaving(true);
    try {
      await replyToReview(selectedReview.id, text);
    } finally {
      setSaving(false);
    }
  }, [canReplyDirectly, replyText, replyToReview, saving, selectedReview]);

  const applyTemplate = useCallback((template) => {
    if (!canReplyDirectly) return;
    setReplyText((current) => current ? `${current}\n${template}` : template);
  }, [canReplyDirectly]);

  if (!open) return null;

  return (
    <div className="portal-reviews-layer" role="presentation">
      <button
        className="portal-reviews-layer__overlay"
        type="button"
        onClick={onClose}
        aria-label="Закрыть новые отзывы"
      />

      <aside className="portal-reviews" aria-label="Центр новых отзывов">
        <header className="portal-reviews__header">
          <div className="portal-reviews__heading">
            <span className="portal-reviews__eyebrow">Репутация · входящие</span>
            <div className="portal-reviews__titleRow">
              <h2>Отзывы</h2>
              <span className="portal-reviews__live"><i />Обновляется</span>
            </div>
            <p>Отвечайте на новые отзывы и контролируйте обработку без перехода между страницами.</p>
          </div>

          <div className="portal-reviews__headerActions">
            <button
              type="button"
              className="portal-reviews__openCenter"
              onClick={() => { onClose?.(); navigate('/reviews'); }}
            >
              Открыть центр
              <span>→</span>
            </button>
            <button
              ref={closeRef}
              type="button"
              className="portal-reviews__close"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <section className="portal-reviews__stats" aria-label="Краткая статистика">
          <div>
            <span>Без ответа</span>
            <strong>{stats.pending}</strong>
          </div>
          <div>
            <span>Негативные</span>
            <strong className="is-danger">{stats.negative}</strong>
          </div>
          <div>
            <span>Средняя оценка</span>
            <strong>{stats.average || '—'} <small>★</small></strong>
          </div>
        </section>

        <nav className="portal-reviews__tabs" aria-label="Статусы отзывов">
          {REVIEW_TABS.map((tab) => (
            <button
              type="button"
              key={tab.value}
              className={activeTab === tab.value ? 'is-active' : ''}
              onClick={() => {
                setActiveTab(tab.value);
                setMobileDetail(false);
              }}
            >
              <span>{tab.label}</span>
              <em>{counts[tab.value] || 0}</em>
            </button>
          ))}
        </nav>

        <div className="portal-reviews__toolbar">
          <label className="portal-reviews__search">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Автор, текст или площадка"
              aria-label="Поиск по отзывам"
            />
          </label>

          <div className="portal-reviews__filters">
            <span className="portal-reviews__filterIcon"><FilterIcon /></span>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Площадка">
              {REVIEW_PLATFORMS.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={rating} onChange={(event) => setRating(event.target.value)} aria-label="Рейтинг">
              {REVIEW_RATINGS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>

        <div className={`portal-reviews__workspace ${mobileDetail ? 'is-detail-mobile' : ''}`}>
          <section className="portal-reviews__listPane" aria-label="Список отзывов">
            <div className="portal-reviews__listHead">
              <span>{loading ? 'Загрузка…' : formatCount(filteredReviews.length)}</span>
              {deferredQuery ? <small>по запросу «{deferredQuery}»</small> : null}
            </div>

            {loading ? <ReviewsSkeleton /> : null}

            {!loading && error ? (
              <div className="portal-reviews__state">
                <strong>Отзывы не загрузились</strong>
                <span>{error}</span>
                <button type="button" onClick={reload}>Повторить</button>
              </div>
            ) : null}

            {!loading && !error && !visibleReviews.length ? (
              <div className="portal-reviews__state portal-reviews__state--empty">
                <span className="portal-reviews__stateIcon"><CircleCheckIcon /></span>
                <strong>Здесь всё спокойно</strong>
                <span>По выбранным фильтрам отзывов нет.</span>
                {(query || platform !== 'Все площадки' || rating !== 'all') ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setPlatform('Все площадки');
                      setRating('all');
                    }}
                  >
                    Сбросить фильтры
                  </button>
                ) : null}
              </div>
            ) : null}

            {!loading && !error ? (
              <div className="portal-reviews__list">
                {visibleReviews.map((review) => (
                  <MemoReviewCard
                    key={review.id}
                    review={review}
                    selected={review.id === selectedId}
                    onSelect={handleSelect}
                  />
                ))}

                {visibleCount < filteredReviews.length ? (
                  <button
                    type="button"
                    className="portal-reviews__loadMore"
                    onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                  >
                    Показать ещё
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="portal-reviews__detailPane" aria-label="Работа с отзывом">
            {selectedReview ? (
              <div className="portal-review-detail">
                <button
                  type="button"
                  className="portal-review-detail__mobileBack"
                  onClick={() => setMobileDetail(false)}
                >
                  <ArrowBackIcon />
                  <span>К списку</span>
                </button>

                <div className="portal-review-detail__authorRow">
                  <span className={`portal-review-detail__avatar portal-review-detail__avatar--${selectedReview.rating <= 3 ? 'negative' : selectedReview.rating === 4 ? 'neutral' : 'positive'}`}>
                    {selectedReview.initials}
                  </span>
                  <div>
                    <strong>{selectedReview.author}</strong>
                    <span>{selectedReview.platform} · {selectedReview.date}, {selectedReview.time}</span>
                  </div>
                </div>

                <div className="portal-review-detail__ratingRow">
                  <div className="portal-review-stars portal-review-stars--large">
                    {makeStars(selectedReview.rating).map((filled, index) => (
                      <i key={index} className={filled ? 'is-filled' : ''}>★</i>
                    ))}
                  </div>
                  <strong>{selectedReview.rating}.0</strong>
                </div>

                <blockquote>{selectedReview.text}</blockquote>

                <div className="portal-review-detail__meta">
                  <div>
                    <span>Источник</span>
                    <strong>{selectedReview.source}</strong>
                  </div>
                  <div>
                    <span>Категории</span>
                    <p>{(selectedReview.tags || []).map((tag) => <em key={tag}>{tag}</em>)}</p>
                  </div>
                </div>

                <div className="portal-review-detail__divider" />

                <div className="portal-review-detail__composerHead">
                  <div>
                    <span>Ответ компании</span>
                    <small>{!canReply ? 'Только просмотр по вашей роли' : !canReplyDirectly ? `Политика организации: ${reviewPolicy.responseMode === 'approval' ? 'ответ через согласование' : 'отвечает Бизнес Щит'}` : selectedReview.status === REVIEW_STATUS.DONE && selectedReview.reply ? 'Ответ сохранён' : 'Можно отредактировать перед отправкой'}</small>
                  </div>
                </div>
                {!canReply ? <div className="portal-review-detail__access-note">Ответы отключены для вашей роли. Владелец может изменить доступ в «Команда и доступ».</div> : null}
                {canReply && !canReplyDirectly ? <div className="portal-review-detail__access-note">Быстрый drawer не обходит политику ответов. Откройте Reputation Operations Center для согласования или передачи Бизнес Щит.</div> : null}

                <div className="portal-review-detail__templates" aria-label="Быстрые шаблоны">
                  {REVIEW_REPLY_TEMPLATES.map((template, index) => (
                    <button type="button" key={template} onClick={() => canReplyDirectly && applyTemplate(template)} disabled={!canReplyDirectly}>
                      Шаблон {index + 1}
                    </button>
                  ))}
                </div>

                <label className="portal-review-detail__textarea">
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="Напишите ответ клиенту…"
                    rows={6}
                    maxLength={1000}
                    readOnly={!canReplyDirectly}
                    aria-readonly={!canReplyDirectly}
                  />
                  <span>{replyText.length}/1000</span>
                </label>

                <div className="portal-review-detail__actions">
                  <button
                    type="button"
                    className="portal-review-detail__send"
                    disabled={!canReplyDirectly || !replyText.trim() || saving}
                    onClick={handleReply}
                  >
                    <SendIcon />
                    <span>{saving ? 'Сохраняем…' : selectedReview.status === REVIEW_STATUS.DONE ? 'Обновить ответ' : 'Отправить ответ'}</span>
                  </button>
                  {canReply && !canReplyDirectly ? (
                    <button
                      type="button"
                      className="portal-review-detail__secondary"
                      onClick={() => { onClose?.(); navigate(`/reviews?review=${encodeURIComponent(selectedReview.id)}`); }}
                    >
                      Открыть рабочий центр
                    </button>
                  ) : null}

                  {selectedReview.status === REVIEW_STATUS.NEW ? (
                    <button
                      type="button"
                      className="portal-review-detail__iconAction"
                      onClick={() => handleStatusChange(REVIEW_STATUS.DEFERRED)}
                      disabled={saving || !canModerate}
                      title={canModerate ? 'Отложить' : 'Нет права менять статус'}
                    >
                      <ClockIcon />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="portal-review-detail__secondary"
                      onClick={() => handleStatusChange(REVIEW_STATUS.NEW)}
                      disabled={saving || !canModerate}
                    >
                      Вернуть в работу
                    </button>
                  )}

                  {selectedReview.status !== REVIEW_STATUS.DONE ? (
                    <button
                      type="button"
                      className="portal-review-detail__iconAction is-success"
                      onClick={() => handleStatusChange(REVIEW_STATUS.DONE)}
                      disabled={saving || !canModerate}
                      title={canModerate ? 'Отметить обработанным' : 'Нет права менять статус'}
                    >
                      <CircleCheckIcon />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="portal-reviews__detailEmpty">
                <span><CircleCheckIcon /></span>
                <strong>Выберите отзыв</strong>
                <p>Здесь появятся детали и поле для ответа.</p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

export default memo(PortalReviewsDrawer);
