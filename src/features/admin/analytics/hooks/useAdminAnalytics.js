import { useCallback, useEffect, useState } from 'react';
import { getAdminAnalytics } from '../../../../services/admin/adminAnalyticsService';

export default function useAdminAnalytics(period) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(true);

  const refresh = useCallback(async () => {
    setRefreshing(true); setError('');
    try { setData(await getAdminAnalytics(period)); }
    catch (err) { setError(err?.message || 'Не удалось загрузить аналитику'); }
    finally { setRefreshing(false); }
  }, [period]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, error, refreshing, refresh };
}
