import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminManagers } from '../../../../services/admin/adminManagersService';
import { addAdminTicketMessage, getAdminTickets, updateAdminTicket } from '../../../../services/admin/adminTicketsService';

export default function useAdminTickets() {
  const [tickets, setTickets] = useState(null);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ticketResult, managerResult] = await Promise.all([getAdminTickets(), getAdminManagers()]);
      setTickets(ticketResult.tickets);
      setManagers(managerResult.managers);
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить тикеты');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => {
    const list = tickets || [];
    return {
      open: list.filter((ticket) => ticket.status === 'open').length,
      inProgress: list.filter((ticket) => ticket.status === 'in_progress' || ticket.status === 'waiting').length,
      highPriority: list.filter((ticket) => ticket.priority === 'high' && ticket.status !== 'closed').length,
      closedMonth: list.filter((ticket) => ticket.status === 'closed').length,
      unread: list.reduce((sum, ticket) => sum + Number(ticket.unread || 0), 0),
      slaRisk: list.filter((ticket) => ticket.status !== 'closed' && Number(ticket.firstResponseMinutes || 0) >= Number(ticket.slaMinutes || 60) * .7).length,
    };
  }, [tickets]);

  const patchTicket = useCallback(async (ticketId, patch) => {
    setSaving(true);
    try {
      const updated = await updateAdminTicket(ticketId, patch);
      setTickets((current) => (current || []).map((ticket) => ticket.id === ticketId ? updated : ticket));
      return updated;
    } finally {
      setSaving(false);
    }
  }, []);

  const sendMessage = useCallback(async (ticketId, payload) => {
    setSaving(true);
    try {
      const created = await addAdminTicketMessage(ticketId, payload);
      const result = await getAdminTickets();
      setTickets(result.tickets);
      return created;
    } finally {
      setSaving(false);
    }
  }, []);

  const assignManager = useCallback(async (ticketId, managerId) => {
    const manager = managers.find((item) => item.id === managerId);
    return patchTicket(ticketId, {
      assignedManagerId: managerId,
      assignedManagerName: manager?.name || 'Не назначен',
      updatedAt: new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).replace(',', ''),
    });
  }, [managers, patchTicket]);

  return { tickets, managers, metrics, loading, saving, error, refresh: load, patchTicket, sendMessage, assignManager };
}
