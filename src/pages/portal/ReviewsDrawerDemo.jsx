import React, { useMemo, useState } from 'react';
import PortalLayout from '../../layouts/PortalLayout';

const reviewsSeed = [
  {
    id: 1,
    author: 'Иван Петров',
    initials: 'ИП',
    avatarClass: 'avatar--0',
    platform: '2GIS',
    rating: 2,
    date: '17.02.2026',
    text: 'Очень долго ждали заказ, персонал был груб. Хотелось бы улучшений в обслуживании.',
    status: 'new',
  },
  {
    id: 2,
    author: 'Анна Сидорова',
    initials: 'АС',
    avatarClass: 'avatar--1',
    platform: 'Яндекс',
    rating: 1,
    date: '16.02.2026',
    text: 'Ужасное качество продукции. Не рекомендую никому.',
    status: 'new',
  },
  {
    id: 3,
    author: 'Сергей Козлов',
    initials: 'СК',
    avatarClass: 'avatar--2',
    platform: 'Google',
    rating: 3,
    date: '15.02.2026',
    text: 'Средне. Есть и плюсы и минусы. Можно лучше.',
    status: 'new',
  },
  {
    id: 4,
    author: 'Мария Новикова',
    initials: 'МН',
    avatarClass: 'avatar--2',
    platform: 'Отзовик',
    rating: 2,
    date: '14.02.2026',
    text: 'Товар не соответствует описанию на сайте. Вводите покупателей в заблуждение.',
    status: 'new',
  },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 16L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M5 7H19L14 12V17L10 19V12L5 7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M8 8L16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 8L8 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8.5V12L14.5 13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CircleCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.4 12.2L11.2 14L14.9 10.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function makeStars(rating) {
  return Array.from({ length: 5 }).map((_, index) => index < rating);
}

export default function ReviewsDrawerDemo() {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [platform, setPlatform] = useState('Все площадки');
  const [ratingFilter, setRatingFilter] = useState('Любой рейтинг');
  const [reviews, setReviews] = useState(reviewsSeed);

  const filteredReviews = useMemo(() => {
    return reviews.filter((item) => {
      const platformOk =
        platform === 'Все площадки' || item.platform === platform;

      const ratingOk =
        ratingFilter === 'Любой рейтинг' ||
        String(item.rating) === ratingFilter.replace('★', '').trim();

      return platformOk && ratingOk;
    });
  }, [reviews, platform, ratingFilter]);

  const closeReview = (id) => {
    setReviews((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <PortalLayout title="Главная страница" subtitle='ООО "ВНАЛ"'>
      <div className="reviews-demo-page">
        <div className="card reviews-demo-page__placeholder">
          <div className="reviews-demo-page__hero" />
          <div className="reviews-demo-page__row">
            <div className="reviews-demo-page__box" />
            <div className="reviews-demo-page__box" />
          </div>
          <div className="reviews-demo-page__row">
            <div className="reviews-demo-page__box reviews-demo-page__box--lg" />
            <div className="reviews-demo-page__box" />
          </div>
        </div>

        {drawerOpen ? (
          <>
            <div className="reviews-drawer-overlay" onClick={() => setDrawerOpen(false)} />

            <aside className="review-drawer review-drawer--crm">
              <div className="review-drawer__head">
                <div>
                  <div className="review-drawer__eyebrow">Требуют ответа</div>
                  <h2>Новые отзывы</h2>
                </div>

                <div className="review-drawer__meta">
                  <span>{filteredReviews.length} отзывов</span>
                  <button type="button" onClick={() => setDrawerOpen(false)}>
                    <CloseIcon />
                  </button>
                </div>
              </div>

              <div className="review-drawer__filters review-drawer__filters--line">
                <div className="review-drawer__filtersLabel">
                  <FilterIcon />
                  <span>Фильтры:</span>
                </div>

                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="review-drawer__select"
                >
                  <option>Все площадки</option>
                  <option>2GIS</option>
                  <option>Яндекс</option>
                  <option>Google</option>
                  <option>Отзовик</option>
                </select>

                <select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value)}
                  className="review-drawer__select"
                >
                  <option>Любой рейтинг</option>
                  <option>1 ★</option>
                  <option>2 ★</option>
                  <option>3 ★</option>
                  <option>4 ★</option>
                  <option>5 ★</option>
                </select>
              </div>

              <div className="review-drawer__list">
                {filteredReviews.map((review) => (
                  <article className="review-item review-item--crm" key={review.id}>
                    <div className="review-item__top">
                      <span className={`avatar ${review.avatarClass}`}>{review.initials}</span>

                      <div className="review-item__content">
                        <div className="review-item__headRow">
                          <div>
                            <div className="review-item__author">{review.author}</div>
                            <div className="review-item__ratingRow">
                              <div className="stars stars--crm">
                                {makeStars(review.rating).map((filled, index) => (
                                  <span
                                    key={index}
                                    className={filled ? 'is-filled' : 'is-empty'}
                                  >
                                    ★
                                  </span>
                                ))}
                              </div>
                              <span className="review-item__date">{review.date}</span>
                            </div>
                          </div>

                          <div className="review-item__platform">{review.platform}</div>
                        </div>

                        <p className="review-item__text">{review.text}</p>

                        <div className="review-item__actions review-item__actions--drawer">
                          <button type="button" className="review-item__replyBtn">
                            Ответить
                          </button>

                          <button type="button" className="icon-round review-item__smallBtn">
                            <ClockIcon />
                          </button>

                          <button
                            type="button"
                            className="icon-round success review-item__smallBtn"
                            onClick={() => closeReview(review.id)}
                          >
                            <CircleCheckIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}

                {!filteredReviews.length ? (
                  <div className="review-drawer__empty">
                    По текущим фильтрам отзывов нет
                  </div>
                ) : null}
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </PortalLayout>
  );
}