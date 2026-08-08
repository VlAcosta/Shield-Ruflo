import { useCallback, useEffect, useState } from 'react';
import { getReputationAnalytics } from '../../../services/reputation/reputationAnalyticsService';
import { REVIEWS_CHANGED_EVENT } from '../../../services/reviews/reviewsService';
import { REVIEW_SETTINGS_CHANGED_EVENT } from '../../../services/reviews/reviewIntelligenceService';

export default function useReputationIntelligence() {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    const controller = new AbortController();
    try {
      const data = await getReputationAnalytics({ days, signal: controller.signal });
      setState({ loading: false, error: '', data });
    } catch (error) {
      if (error?.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error?.message || 'Не удалось собрать аналитику' }));
    }
    return () => controller.abort();
  }, [days]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: '' }));
    getReputationAnalytics({ days, signal: controller.signal })
      .then((data) => active && setState({ loading: false, error: '', data }))
      .catch((error) => { if (active && error?.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error?.message || 'Не удалось собрать аналитику' })); });
    return () => { active = false; controller.abort(); };
  }, [days]);

  useEffect(() => {
    const handler = () => load({ quiet: true });
    window.addEventListener(REVIEWS_CHANGED_EVENT, handler);
    window.addEventListener(REVIEW_SETTINGS_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(REVIEWS_CHANGED_EVENT, handler);
      window.removeEventListener(REVIEW_SETTINGS_CHANGED_EVENT, handler);
    };
  }, [load]);

  return { ...state, days, setDays, reload: load };
}
