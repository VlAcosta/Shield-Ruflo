import { useEffect, useState } from 'react';
import {
  TEAM_SECURITY_CHANGED_EVENT,
  evaluateCurrentMemberSecurity,
  refreshTeamSecurityState,
} from '../../../services/security/teamSecurityService';
import { COMPANY_MEMBERSHIP_CHANGED_EVENT } from '../../../services/profile/companyInvitationService';

export default function useMemberSecurityGate(enabled = true) {
  const [status, setStatus] = useState(() => enabled ? evaluateCurrentMemberSecurity() : { blocked: false, reason: '' });

  useEffect(() => {
    if (!enabled) {
      setStatus({ blocked: false, reason: '' });
      return undefined;
    }
    const refresh = () => setStatus(evaluateCurrentMemberSecurity());
    const onStorage = (event) => {
      if (!event.key || event.key.includes('team-security') || event.key.includes('membership') || event.key === 'currentUser') refresh();
    };
    refresh();
    refreshTeamSecurityState().then(refresh).catch(() => {});
    window.addEventListener(TEAM_SECURITY_CHANGED_EVENT, refresh);
    window.addEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(() => { refreshTeamSecurityState().then(refresh).catch(refresh); }, 30000);
    return () => {
      window.removeEventListener(TEAM_SECURITY_CHANGED_EVENT, refresh);
      window.removeEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, [enabled]);

  return status;
}
