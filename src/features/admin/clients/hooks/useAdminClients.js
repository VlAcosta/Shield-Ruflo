import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAdminClient, getAdminClients, updateAdminClient } from '../../../../services/admin/adminClientsService';
import { ADMIN_CLIENT_MANAGERS, ADMIN_CLIENT_PLANS } from '../model/adminClientsData';

const statusLabels = { active: 'Активен', trial: 'Пробный', expired: 'Истёк', cancelled: 'Отменён' };

function normalizeNewClient(payload) {
  const plan = ADMIN_CLIENT_PLANS.find((item) => item.id === payload.planId) || ADMIN_CLIENT_PLANS[0];
  const manager = ADMIN_CLIENT_MANAGERS.find((item) => item.id === payload.managerId) || ADMIN_CLIENT_MANAGERS[0];
  const clean = payload.name.replace(/[«»"']/g, '').replace(/^(ООО|ИП)\s+/u, '').trim();
  return {
    ...payload,
    initials: clean.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'КЛ',
    plan: plan.label,
    statusLabel: statusLabels[payload.status] || statusLabels.active,
    manager: manager.short,
    managerName: manager.name,
    managerInitials: manager.initials,
    revenue: payload.status === 'active' ? plan.price : 0,
    rating: 0,
    tasks: 0,
    reviews: 0,
    tickets: 0,
    startDate: payload.startDate || new Date().toLocaleDateString('ru-RU'),
    expiryDate: payload.expiryDate || '',
    autoRenew: payload.status === 'active',
  };
}

export default function useAdminClients() {
  const [clients, setClients] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAdminClients();
      setClients(result.clients);
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
      const normalized = normalizeNewClient(payload);
      const created = await createAdminClient(normalized);
      setClients((current) => [created, ...(current || [])]);
      return created;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateClient = useCallback(async (clientId, patch) => {
    setSaving(true);
    try {
      const nextPatch = { ...patch };
      if (patch.planId) {
        const plan = ADMIN_CLIENT_PLANS.find((item) => item.id === patch.planId);
        if (plan) {
          nextPatch.plan = plan.label;
          if ((patch.status || clients?.find((item) => item.id === clientId)?.status) === 'active') nextPatch.revenue = plan.price;
        }
      }
      if (patch.managerId) {
        const manager = ADMIN_CLIENT_MANAGERS.find((item) => item.id === patch.managerId);
        if (manager) Object.assign(nextPatch, { manager: manager.short, managerName: manager.name, managerInitials: manager.initials });
      }
      if (patch.status) {
        nextPatch.statusLabel = statusLabels[patch.status] || patch.status;
        const current = clients?.find((item) => item.id === clientId);
        const effectivePlanId = patch.planId || current?.planId;
        const effectivePlan = ADMIN_CLIENT_PLANS.find((item) => item.id === effectivePlanId);
        nextPatch.revenue = patch.status === 'active' ? (effectivePlan?.price || current?.revenue || 0) : 0;
        nextPatch.autoRenew = patch.status === 'active';
      }
      const updated = await updateAdminClient(clientId, nextPatch);
      setClients((current) => (current || []).map((item) => item.id === clientId ? updated : item));
      return updated;
    } finally {
      setSaving(false);
    }
  }, [clients]);

  const metrics = useMemo(() => {
    const list = clients || [];
    return {
      total: list.length,
      active: list.filter((item) => item.status === 'active').length,
      trial: list.filter((item) => item.status === 'trial').length,
      revenue: list.reduce((sum, item) => sum + (item.status === 'active' ? Number(item.revenue || 0) : 0), 0),
    };
  }, [clients]);

  return { clients, metrics, loading, saving, error, refresh: load, createClient, updateClient };
}
