import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getReviews,
  REVIEWS_CHANGED_EVENT,
  submitReviewReply,
  updateReview,
} from '../../../services/reviews/reviewsService';

export default function useReviews(query = {}) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 30, total: 0, pages: 1 });

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');

    try {
      const result = await getReviews({ ...query, page, pageSize: pagination.pageSize });
      setReviews(result.items);
      setPagination(result.pagination);
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось загрузить отзывы');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, query]);

  useEffect(() => {
    load();
    const handleChanged = (event) => {
      if (Array.isArray(event.detail?.reviews) && event.detail.reviews.length > 1) setReviews(event.detail.reviews);
      else load();
    };
    window.addEventListener(REVIEWS_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(REVIEWS_CHANGED_EVENT, handleChanged);
  }, [load]);

  const patchReview = useCallback(async (reviewId, patch) => {
    setReviews((current) => current.map((item) => (
      item.id === reviewId ? { ...item, ...patch } : item
    )));

    try {
      const next = await updateReview(reviewId, patch);
      setReviews((current) => current.map((item) => item.id === reviewId ? next : item));
      return next;
    } catch (requestError) {
      await load(pagination.page);
      throw requestError;
    }
  }, [load, pagination.page]);

  const replyToReview = useCallback(async (reviewId, reply) => {
    setReviews((current) => current.map((item) => (
      item.id === reviewId ? { ...item, reply, status: 'deferred', workflowStatus: 'draft' } : item
    )));

    try {
      const next = await submitReviewReply(reviewId, reply, { publish: false });
      setReviews((current) => current.map((item) => item.id === reviewId ? next : item));
      return next;
    } catch (requestError) {
      await load(pagination.page);
      throw requestError;
    }
  }, [load, pagination.page]);

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
    pagination,
    goToPage: (page) => load(Math.min(Math.max(1, page), pagination.pages)),
  };
}
