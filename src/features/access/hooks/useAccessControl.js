import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RBAC_CHANGED_EVENT,
  getCurrentAccessContext,
  hasPermission,
} from '../../../services/access/rbacService';
import { COMPANY_MEMBERSHIP_CHANGED_EVENT } from '../../../services/profile/companyInvitationService';
import { SESSION_CHANGED_EVENT } from '../../../services/auth/authService';

function readServerOrganizationContext() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null')?.organizationContext || null;
  } catch {
    return null;
  }
}

export default function useAccessControl() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    const onStorage = (event) => {
      if (!event.key || event.key.includes('rbac') || event.key.includes('membership') || event.key === 'currentUser') refresh();
    };
    window.addEventListener(RBAC_CHANGED_EVENT, refresh);
    window.addEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RBAC_CHANGED_EVENT, refresh);
      window.removeEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const context = useMemo(() => {
    // `version` intentionally invalidates this snapshot after RBAC/membership/session events.
    void version;
    const base = getCurrentAccessContext();
    const organizationContext = readServerOrganizationContext();
    if (!organizationContext?.organizationId || !Array.isArray(organizationContext.permissions)) {
      return {
        ...base,
        organizationContext,
        accessMode: organizationContext?.accessMode || (base.membership ? 'DIRECT' : 'NONE'),
        isDelegated: organizationContext?.accessMode === 'DELEGATED',
      };
    }

    const permissions = Array.from(new Set(organizationContext.permissions.filter((permission) => typeof permission === 'string')));
    return {
      ...base,
      permissions,
      permissionSet: new Set(permissions),
      organizationContext,
      accessMode: organizationContext.accessMode || (base.membership ? 'DIRECT' : 'NONE'),
      isDelegated: organizationContext.accessMode === 'DELEGATED',
    };
  }, [version]);
  const can = useCallback((permission) => hasPermission(permission, context), [context]);
  const canAny = useCallback((permissions = []) => permissions.some((permission) => can(permission)), [can]);
  const canAll = useCallback((permissions = []) => permissions.every((permission) => can(permission)), [can]);

  return { ...context, can, canAny, canAll };
}
