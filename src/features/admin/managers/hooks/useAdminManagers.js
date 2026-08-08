import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminClients, updateAdminClient } from '../../../../services/admin/adminClientsService';
import { createAdminManager, getAdminManagers, updateAdminManager } from '../../../../services/admin/adminManagersService';
import { initialsForManager } from '../model/adminManagersData';

function normalizeManager(payload) {
  return {
    id: payload.id || `manager-${Date.now()}`,
    initials: initialsForManager(payload.name),
    name: payload.name,
    shortName: payload.name?.split(/\s+/)[0] || payload.name,
    email: payload.email,
    phone: payload.phone || '',
    role: payload.role || 'Персональный менеджер',
    joinedAt: payload.joinedAt || new Date().toLocaleDateString('ru-RU'),
    status: payload.status || 'active',
    statusLabel: payload.status === 'training' ? 'Обучение' : payload.status === 'paused' ? 'Приостановлен' : 'Активен',
    rating: Number(payload.rating || 0),
    openTickets: Number(payload.openTickets || 0),
    capacity: Number(payload.capacity || 6),
    tone: payload.tone || 'violet',
    responseTime: Number(payload.responseTime || 0),
    satisfaction: Number(payload.satisfaction || 0),
    performance: Array.isArray(payload.performance) ? payload.performance : [48, 56, 62, 68, 74, 79, 84],
  };
}

export default function useAdminManagers() {
  const [managers, setManagers] = useState(null);
  const [clients, setClients] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [managerResult, clientResult] = await Promise.all([getAdminManagers(), getAdminClients()]);
      setManagers(managerResult.managers);
      setClients(clientResult.clients);
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить команду');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enrichedManagers = useMemo(() => {
    if (!managers) return null;
    const list = clients || [];
    return managers.map((manager) => {
      const assignedClients = list.filter((client) => client.managerId === manager.id);
      const activeClients = assignedClients.filter((client) => client.status === 'active');
      const revenue = activeClients.reduce((sum, client) => sum + Number(client.revenue || 0), 0);
      return {
        ...manager,
        clients: assignedClients,
        clientsCount: assignedClients.length,
        activeClients: activeClients.length,
        revenue,
        load: Math.min(100, Math.round((assignedClients.length / Math.max(1, manager.capacity || 6)) * 100)),
      };
    });
  }, [managers, clients]);

  const metrics = useMemo(() => {
    const list = enrichedManagers || [];
    const rated = list.filter((item) => Number(item.rating) > 0);
    return {
      total: list.length,
      active: list.filter((item) => item.status === 'active').length,
      rating: rated.length ? rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length : 0,
      revenue: list.reduce((sum, item) => sum + Number(item.revenue || 0), 0),
      tickets: list.reduce((sum, item) => sum + Number(item.openTickets || 0), 0),
    };
  }, [enrichedManagers]);

  const createManager = useCallback(async (payload) => {
    setSaving(true);
    try {
      const created = await createAdminManager(normalizeManager(payload));
      setManagers((current) => [...(current || []), created]);
      return created;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateManager = useCallback(async (managerId, patch) => {
    setSaving(true);
    try {
      const normalizedPatch = { ...patch };
      if (patch.name) {
        normalizedPatch.initials = initialsForManager(patch.name);
        normalizedPatch.shortName = patch.name.split(/\s+/)[0];
      }
      if (patch.status) {
        normalizedPatch.statusLabel = patch.status === 'training' ? 'Обучение' : patch.status === 'paused' ? 'Приостановлен' : 'Активен';
      }
      const updated = await updateAdminManager(managerId, normalizedPatch);
      setManagers((current) => (current || []).map((item) => item.id === managerId ? updated : item));
      return updated;
    } finally {
      setSaving(false);
    }
  }, []);

  const assignClient = useCallback(async (clientId, managerId) => {
    setSaving(true);
    try {
      const manager = managers?.find((item) => item.id === managerId);
      const updated = await updateAdminClient(clientId, {
        managerId,
        manager: manager?.shortName || manager?.name || 'Менеджер',
        managerName: manager?.name || 'Менеджер',
        managerInitials: manager?.initials || 'МН',
      });
      setClients((current) => (current || []).map((item) => item.id === clientId ? updated : item));
      return updated;
    } finally {
      setSaving(false);
    }
  }, [managers]);

  return {
    managers: enrichedManagers,
    clients,
    metrics,
    loading,
    saving,
    error,
    refresh: load,
    createManager,
    updateManager,
    assignClient,
  };
}
