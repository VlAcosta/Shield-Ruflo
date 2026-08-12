import { useCallback, useEffect, useMemo, useState } from 'react';
import { authService, SESSION_CHANGED_EVENT } from '../../../services/auth/authService';
import { agencyService } from '../../../services/agency/agencyService';
import { organizationContextService } from '../../../services/organizations/organizationContextService';
import { ORGANIZATION_CONTEXT_CHANGED_EVENT } from '../../access/hooks/useOrganizationContext';

function normalizeDirect(item) {
  if (!item?.organization?.id) return null;
  return {
    id: item.organization.id,
    organization: item.organization,
    membership: item.membership || null,
    agency: null,
    access: {
      mode: 'DIRECT',
      permissions: Array.isArray(item.membership?.permissions) ? item.membership.permissions : [],
      expiresAt: item.membership?.accessExpiresAt || null,
    },
  };
}

function normalizeDelegated(item) {
  if (!item?.organization?.id) return null;
  return {
    id: item.organization.id,
    organization: item.organization,
    membership: null,
    agency: item.agency || null,
    access: {
      mode: 'DELEGATED',
      permissions: Array.isArray(item.access?.permissions) ? item.access.permissions : [],
      expiresAt: item.access?.expiresAt || null,
      grantId: item.access?.grantId || null,
      linkId: item.access?.linkId || null,
    },
  };
}

function readCachedContext() {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    return user?.organizationContext || null;
  } catch {
    return null;
  }
}

export default function useWorkspaceSwitcher({ enabled = true } = {}) {
  const cachedContext = readCachedContext();
  const [items, setItems] = useState([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState(cachedContext?.organizationId || null);
  const [state, setState] = useState(enabled ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [switchingId, setSwitchingId] = useState('');

  const load = useCallback(async (signal) => {
    if (!enabled) return [];
    setState('loading');
    setError('');
    try {
      const [directResult, delegatedResult] = await Promise.all([
        organizationContextService.list({ signal }),
        agencyService.listWorkspaces({ signal }),
      ]);
      const direct = directResult.organizations.map(normalizeDirect).filter(Boolean);
      const directIds = new Set(direct.map((item) => item.id));
      const delegated = delegatedResult
        .map(normalizeDelegated)
        .filter((item) => item && !directIds.has(item.id));
      const next = [...direct, ...delegated];
      setItems(next);
      setActiveOrganizationId(directResult.activeOrganizationId || readCachedContext()?.organizationId || null);
      setState('ready');
      return next;
    } catch (requestError) {
      if (requestError?.name === 'AbortError') return [];
      setError(requestError?.message || 'Не удалось загрузить рабочие пространства');
      setState('error');
      return [];
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  useEffect(() => {
    const sync = (event) => {
      const organizationId = event.detail?.organizationContext?.organizationId
        || event.detail?.membership?.organizationId
        || readCachedContext()?.organizationId
        || null;
      setActiveOrganizationId(organizationId);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, sync);
  }, []);

  const select = useCallback(async (workspace) => {
    if (!workspace?.id || switchingId || workspace.id === activeOrganizationId) return null;
    setSwitchingId(workspace.id);
    setError('');
    try {
      let user;
      if (workspace.access?.mode === 'DELEGATED') {
        await agencyService.selectWorkspace(workspace.id);
        user = await authService.restoreSession();
      } else {
        user = await organizationContextService.select(workspace.id);
        authService.persistSession({ user });
      }
      const organizationId = user?.organizationContext?.organizationId
        || user?.membership?.organizationId
        || workspace.id;
      setActiveOrganizationId(organizationId);
      window.dispatchEvent(new CustomEvent(ORGANIZATION_CONTEXT_CHANGED_EVENT, {
        detail: {
          organizationId,
          accessMode: user?.organizationContext?.accessMode || workspace.access?.mode || 'DIRECT',
        },
      }));
      return user;
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось сменить рабочее пространство');
      throw requestError;
    } finally {
      setSwitchingId('');
    }
  }, [activeOrganizationId, switchingId]);

  const activeWorkspace = useMemo(
    () => items.find((item) => item.id === activeOrganizationId) || null,
    [items, activeOrganizationId],
  );

  return useMemo(() => ({
    items,
    directItems: items.filter((item) => item.access.mode === 'DIRECT'),
    delegatedItems: items.filter((item) => item.access.mode === 'DELEGATED'),
    activeWorkspace,
    activeOrganizationId,
    state,
    error,
    switchingId,
    load,
    select,
  }), [items, activeWorkspace, activeOrganizationId, state, error, switchingId, load, select]);
}
