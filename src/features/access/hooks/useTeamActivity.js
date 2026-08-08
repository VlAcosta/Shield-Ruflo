import { useEffect, useMemo, useState } from 'react';
import {
  COMPANY_ACTIVITY_CHANGED_EVENT,
  COMPANY_PRESENCE_CHANGED_EVENT,
  activityForMember,
  enrichMemberPresence,
  readCompanyActivity,
  readCompanyPresence,
} from '../../../services/activity/companyActivityService';

export default function useTeamActivity(users = []) {
  const [activity, setActivity] = useState(readCompanyActivity);
  const [presence, setPresence] = useState(readCompanyPresence);

  useEffect(() => {
    const refreshActivity = () => setActivity(readCompanyActivity());
    const refreshPresence = () => setPresence(readCompanyPresence());
    const onStorage = (event) => {
      if (!event.key || event.key.includes('company-activity')) refreshActivity();
      if (!event.key || event.key.includes('company-presence')) refreshPresence();
    };
    window.addEventListener(COMPANY_ACTIVITY_CHANGED_EVENT, refreshActivity);
    window.addEventListener(COMPANY_PRESENCE_CHANGED_EVENT, refreshPresence);
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(refreshPresence, 30000);
    return () => {
      window.removeEventListener(COMPANY_ACTIVITY_CHANGED_EVENT, refreshActivity);
      window.removeEventListener(COMPANY_PRESENCE_CHANGED_EVENT, refreshPresence);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
  }, []);

  const enrichedUsers = useMemo(() => users.map((user) => enrichMemberPresence(user, presence)), [presence, users]);
  const getActivity = useMemo(() => (user) => activityForMember(user, activity), [activity]);
  return { activity, presence, users: enrichedUsers, getActivity };
}
