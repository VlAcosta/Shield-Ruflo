import { useEffect, useMemo, useState } from 'react';
import {
  TEAM_SECURITY_CHANGED_EVENT,
  getMemberSecurity,
  getMemberSessions,
  readTeamSecurityState,
  refreshTeamSecurityState,
} from '../../../services/security/teamSecurityService';
import {
  COMPANY_ACTIVITY_CHANGED_EVENT,
  readCompanyActivity,
} from '../../../services/activity/companyActivityService';

const SECURITY_ACTIVITY_TYPES = new Set([
  'security_member_frozen',
  'security_member_unfrozen',
  'security_access_expiry_changed',
  'security_force_logout',
  'security_session_revoked',
  'security_pin_changed',
  'security_autolock_changed',
  'member_role_changed',
  'member_permissions_changed',
  'member_invited',
  'member_removed',
  'login',
]);

export default function useTeamSecurity(users = []) {
  const [state, setState] = useState(readTeamSecurityState);
  const [activity, setActivity] = useState(readCompanyActivity);

  useEffect(() => {
    const refreshSecurity = () => setState(readTeamSecurityState());
    const refreshActivity = () => setActivity(readCompanyActivity());
    const onStorage = (event) => {
      if (!event.key || event.key.includes('team-security')) refreshSecurity();
      if (!event.key || event.key.includes('company-activity')) refreshActivity();
    };
    window.addEventListener(TEAM_SECURITY_CHANGED_EVENT, refreshSecurity);
    window.addEventListener(COMPANY_ACTIVITY_CHANGED_EVENT, refreshActivity);
    window.addEventListener('storage', onStorage);
    refreshTeamSecurityState().then(refreshSecurity).catch(() => {});
    const timer = window.setInterval(() => { refreshTeamSecurityState().then(refreshSecurity).catch(refreshSecurity); }, 30000);
    return () => {
      window.removeEventListener(TEAM_SECURITY_CHANGED_EVENT, refreshSecurity);
      window.removeEventListener(COMPANY_ACTIVITY_CHANGED_EVENT, refreshActivity);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, []);

  const securityById = useMemo(() => {
    const map = {};
    users.forEach((user) => { map[user.id] = getMemberSecurity(user, state); });
    return map;
  }, [state, users]);

  const securityEvents = useMemo(
    () => activity.filter((item) => SECURITY_ACTIVITY_TYPES.has(item.type) || String(item.type || '').startsWith('security_')),
    [activity],
  );

  const getSecurity = useMemo(() => (user) => securityById[user?.id] || getMemberSecurity(user, state), [securityById, state]);
  const getSessions = (user) => getMemberSessions(user);
  const getSecurityActivity = useMemo(() => (user) => securityEvents.filter((item) => item.targetId === user?.id || String(item.actor?.email || '').toLowerCase() === String(user?.email || '').toLowerCase()), [securityEvents]);

  return { state, securityEvents, getSecurity, getSessions, getSecurityActivity };
}
