import { useCallback, useEffect, useMemo, useState } from 'react';
import { authService, SESSION_CHANGED_EVENT } from '../../../services/auth/authService';
import { organizationContextService } from '../../../services/organizations/organizationContextService';

export const ORGANIZATION_CONTEXT_CHANGED_EVENT = 'business-shield:organization-context-changed';

function currentMembership() {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null')?.membership || null; } catch { return null; }
}

export default function useOrganizationContext({ enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState(() => currentMembership()?.organizationId || null);
  const [state, setState] = useState(enabled ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [switchingId, setSwitchingId] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const load = useCallback(async (signal) => {
    if (!enabled) return;
    setState('loading');
    setError('');
    setAnnouncement('Загружаем доступные рабочие пространства');
    try {
      const result = await organizationContextService.list({ signal });
      setItems(result.organizations);
      setActiveOrganizationId(result.activeOrganizationId);
      setState('ready');
      setAnnouncement(result.organizations.length ? 'Рабочие пространства загружены' : 'Активных рабочих пространств нет');
    } catch (requestError) {
      if (requestError?.name === 'AbortError') return;
      setError(requestError?.message || 'Не удалось загрузить рабочие пространства');
      setState('error');
      setAnnouncement('Не удалось загрузить рабочие пространства');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  const select = useCallback(async (organizationId) => {
    if (!organizationId || organizationId === activeOrganizationId || switchingId) return null;
    setSwitchingId(organizationId);
    setError('');
    setAnnouncement('Переключаем рабочее пространство');
    try {
      const user = await organizationContextService.select(organizationId);
      authService.persistSession({ user });
      setActiveOrganizationId(user.membership.organizationId);
      window.dispatchEvent(new CustomEvent(ORGANIZATION_CONTEXT_CHANGED_EVENT, {
        detail: { organizationId: user.membership.organizationId },
      }));
      setAnnouncement(`Рабочее пространство ${user.membership.organization?.name || ''} выбрано`.trim());
      return user;
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось сменить рабочее пространство');
      setAnnouncement('Переключение не выполнено');
      throw requestError;
    } finally {
      setSwitchingId('');
    }
  }, [activeOrganizationId, switchingId]);

  useEffect(() => {
    const sync = (event) => setActiveOrganizationId(event.detail?.membership?.organizationId || event.detail?.membership?.organization?.id || currentMembership()?.organizationId || null);
    window.addEventListener(SESSION_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, sync);
  }, []);

  return useMemo(() => ({ items, activeOrganizationId, state, error, switchingId, announcement, load, select }), [items, activeOrganizationId, state, error, switchingId, announcement, load, select]);
}
