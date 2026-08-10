import { useEffect, useState } from 'react';
import {
  getPendingReviewsCount,
  REVIEWS_CHANGED_EVENT,
} from '../services/reviews/reviewsService';

export default function useReviewsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getPendingReviewsCount({ signal: controller.signal }).then(setCount).catch(() => {});
    const handleChange = (event) => {
      const nextCount = event?.detail?.pending;
      if (Number.isFinite(nextCount)) setCount(nextCount);
      else getPendingReviewsCount().then(setCount).catch(() => {});
    };

    window.addEventListener(REVIEWS_CHANGED_EVENT, handleChange);
    return () => {
      controller.abort();
      window.removeEventListener(REVIEWS_CHANGED_EVENT, handleChange);
    };
  }, []);

  return count;
}
