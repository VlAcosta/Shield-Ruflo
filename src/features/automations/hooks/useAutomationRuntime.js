import { useEffect, useRef } from 'react';
import { evaluateReviewAutomations } from '../../../services/automations/automationService';
import { REVIEWS_CHANGED_EVENT } from '../../../services/reviews/reviewsService';

const PERIODIC_RECHECK_MS = 5 * 60 * 1000;

export default function useAutomationRuntime(enabled = true) {
  const runningRef = useRef(false);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    let cancelled = false;

    const run = async (reason) => {
      if (cancelled || runningRef.current || document.visibilityState === 'hidden') return;
      runningRef.current = true;
      try { await evaluateReviewAutomations({ reason }); } catch { /* runtime remains isolated from the UI */ }
      finally { runningRef.current = false; }
    };

    const onReviewsChanged = () => run('reviews-changed');
    const onVisibility = () => { if (document.visibilityState === 'visible') run('visible'); };
    window.addEventListener(REVIEWS_CHANGED_EVENT, onReviewsChanged);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(() => run('sla-recheck'), PERIODIC_RECHECK_MS);
    const initial = setTimeout(() => run('portal-ready'), 900);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(initial);
      window.removeEventListener(REVIEWS_CHANGED_EVENT, onReviewsChanged);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}
