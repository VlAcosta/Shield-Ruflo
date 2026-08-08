import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminDashboard } from '../../../../services/admin/adminDashboardService';

export default function useAdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    setError('');
    try {
      const next = await getAdminDashboard();
      if (mountedRef.current) setData(next);
    } catch (requestError) {
      if (mountedRef.current) setError(requestError?.message || 'Не удалось загрузить данные');
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  return { data, error, refreshing, refresh: () => load({ silent: false }) };
}
