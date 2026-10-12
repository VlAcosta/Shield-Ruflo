import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAdminClient, getAdminClients, updateAdminClient } from '../../../../services/admin/adminClientsService';
import { getAdminManagers } from '../../../../services/admin/adminManagersService';

export default function useAdminClients() {
  const [clients, setClients] = useState(null);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [clientResult, managerResult] = await Promise.all([
        getAdminClients(),
        getAdminManagers(),
      ]);
      setClients(clientResult.clients);
      setManagers(managerResult.managers);
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createClient = useCallback(async (payload) => {
    setSaving(true);
    try {
      const created = await createAdminClient({
        ...payload,
        managerId: payload.managerId || undefined,
      });
      setClients((current) => [created, ...(current || [])]);
      return created;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateClient = useCallback(async (clientId, patch) => {
    setSaving(true);
    try {
      const updated = await updateAdminClient(clientId, patch);
      setClients((current) => (current || []).map((item) => item.id === clientId ? updated : item));
      return updated;
    } finally {
      setSaving(false);
    }
  }, []);

  const metrics = useMemo(() => {
    const list = clients || [];
    return {
      total: list.length,
      active: list.filter((item) => item.status === 'active').length,
      trial: list.filter((item) => item.status === 'trial').length,
      revenue: list.reduce((sum, item) => sum + (item.status === 'active' ? Number(item.revenue || 0) : 0), 0),
    };
  }, [clients]);

  return {
    clients,
    managers,
    metrics,
    loading,
    saving,
    error,
    refresh: load,
    createClient,
    updateClient,
  };
}
