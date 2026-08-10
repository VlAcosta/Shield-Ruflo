import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RBAC_CHANGED_EVENT,
  getCurrentAccessContext,
  hasPermission,
} from '../../../services/access/rbacService';
import { COMPANY_MEMBERSHIP_CHANGED_EVENT } from '../../../services/profile/companyInvitationService';

export default function useAccessControl() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    const onStorage = (event) => {
      if (!event.key || event.key.includes('rbac') || event.key.includes('membership') || event.key === 'currentUser') refresh();
    };
    window.addEventListener(RBAC_CHANGED_EVENT, refresh);
    window.addEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RBAC_CHANGED_EVENT, refresh);
      window.removeEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const context = useMemo(() => {
    // `version` intentionally invalidates this snapshot after RBAC/membership events.
    void version;
    return getCurrentAccessContext();
  }, [version]);
  const can = useCallback((permission) => hasPermission(permission, context), [context]);
  const canAny = useCallback((permissions = []) => permissions.some((permission) => can(permission)), [can]);
  const canAll = useCallback((permissions = []) => permissions.every((permission) => can(permission)), [can]);

  return { ...context, can, canAny, canAll };
}
