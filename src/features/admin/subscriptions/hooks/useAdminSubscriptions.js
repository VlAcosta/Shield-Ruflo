import { useCallback, useEffect, useState } from 'react';
import { createAdminPlan, getAdminSubscriptions, toggleAdminAutoRenew, updateAdminPlan, updateAdminSubscription } from '../../../../services/admin/adminSubscriptionsService';

export default function useAdminSubscriptions() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      setData(await getAdminSubscriptions());
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить подписки');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);


  const perform = useCallback(async (action) => {
    setSaving(true);
    setError('');
    try {
      const result = await action();
      await refresh();
      return result;
    } catch (err) {
      setError(err?.message || 'Не удалось сохранить изменения');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  return {
    data,
    error,
    refreshing,
    saving,
    refresh,
    updatePlan: (id, patch) => perform(() => updateAdminPlan(id, patch)),
    createPlan: (payload) => perform(() => createAdminPlan(payload)),
    updateSubscription: (id, patch) => perform(() => updateAdminSubscription(id, patch)),
    toggleAutoRenew: (id, value) => perform(() => toggleAdminAutoRenew(id, value)),
  };
}
