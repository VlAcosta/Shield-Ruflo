import { useEffect, useState } from 'react';
import {
  getPendingReviewsCount,
  REVIEWS_CHANGED_EVENT,
} from '../services/reviews/reviewsService';

export default function useReviewsBadge() {
  const [count, setCount] = useState(() => getPendingReviewsCount());

  useEffect(() => {
    const handleChange = (event) => {
      const nextCount = event?.detail?.pending;
      setCount(Number.isFinite(nextCount) ? nextCount : getPendingReviewsCount());
    };

    window.addEventListener(REVIEWS_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(REVIEWS_CHANGED_EVENT, handleChange);
  }, []);

  return count;
}
