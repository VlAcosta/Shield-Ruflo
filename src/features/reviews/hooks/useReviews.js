import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getReviews,
  REVIEWS_CHANGED_EVENT,
  submitReviewReply,
  updateReview,
} from '../../../services/reviews/reviewsService';

export default function useReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const items = await getReviews();
      setReviews(items);
    } catch {
      setError('Не удалось загрузить отзывы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handleChanged = (event) => {
      if (Array.isArray(event.detail?.reviews)) setReviews(event.detail.reviews);
      else load();
    };
    window.addEventListener(REVIEWS_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(REVIEWS_CHANGED_EVENT, handleChanged);
  }, [load]);

  const patchReview = useCallback(async (reviewId, patch) => {
    setReviews((current) => current.map((item) => (
      item.id === reviewId ? { ...item, ...patch } : item
    )));

    const next = await updateReview(reviewId, patch);
    setReviews(next);
  }, []);

  const replyToReview = useCallback(async (reviewId, reply) => {
    setReviews((current) => current.map((item) => (
      item.id === reviewId ? { ...item, reply, status: 'done' } : item
    )));

    const next = await submitReviewReply(reviewId, reply);
    setReviews(next);
  }, []);

  const stats = useMemo(() => {
    if (!reviews.length) return { pending: 0, negative: 0, average: 0 };

    const pending = reviews.filter((item) => item.status === 'new').length;
    const negative = reviews.filter((item) => item.rating <= 3).length;
    const average = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length;

    return {
      pending,
      negative,
      average: Number(average.toFixed(1)),
    };
  }, [reviews]);

  return {
    reviews,
    loading,
    error,
    stats,
    reload: load,
    patchReview,
    replyToReview,
  };
}
