import { useCallback, useEffect, useState } from 'react';
import { getInitials } from '../../../features/profile/model/profileData';
import {
  getProfileSnapshot,
  PROFILE_CHANGED_EVENT,
} from '../../../services/profile/profileService';
import {
  COMPANY_MEMBERSHIP_CHANGED_EVENT,
  readCurrentMembership,
} from '../../../services/profile/companyInvitationService';
import { getCurrentAccessContext, getRoleLabel, RBAC_CHANGED_EVENT } from '../../../services/access/rbacService';

const FALLBACK = Object.freeze({
  firstName: 'Личный',
  lastName: 'Кабинет',
  position: 'Пользователь',
  avatar: '',
});



function readCurrentUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
}

export default function usePortalProfile() {
  const [personal, setPersonal] = useState(FALLBACK);
  const [membership, setMembership] = useState(readCurrentMembership);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await getProfileSnapshot();
      const currentUser = readCurrentUser();
      const currentMembership = currentUser?.membership || readCurrentMembership();
      const roleId = currentMembership?.accessRoleId || currentMembership?.role || 'owner';
      const rolePosition = getRoleLabel(roleId);
      setMembership(currentMembership);
      setPersonal({
        ...FALLBACK,
        ...(snapshot?.personal || {}),
        ...(currentUser?.firstName ? { firstName: currentUser.firstName } : {}),
        ...(currentUser?.lastName ? { lastName: currentUser.lastName } : {}),
        ...(currentUser?.email ? { email: currentUser.email } : {}),
        ...(currentUser?.phone ? { phone: currentUser.phone } : {}),
        roleLabel: rolePosition || '',
      });
    } catch {
      setPersonal((current) => current || FALLBACK);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (event) => {
      if (!event.key || event.key.includes('business-shield:profile') || event.key === 'currentUser' || event.key.includes('company-membership')) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    window.addEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
    window.addEventListener(RBAC_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
      window.removeEventListener(COMPANY_MEMBERSHIP_CHANGED_EVENT, refresh);
      window.removeEventListener(RBAC_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return {
    ...personal,
    membership,
    capabilities: (() => {
      const context = getCurrentAccessContext(membership);
      const set = new Set(context.permissions);
      return {
        role: context.roleId,
        canViewCompany: set.has('company.view'),
        canManageCompany: set.has('company.edit'),
        canViewUsers: set.has('team.view'),
        canManageUsers: set.has('team.manage_roles'),
        canEditWorkspace: set.has('dashboard.edit'),
        canOperateTasks: set.has('tasks.edit') || set.has('tasks.create'),
      };
    })(),
    initials: getInitials(personal.firstName, personal.lastName),
    fullName: `${personal.firstName || ''} ${personal.lastName || ''}`.trim() || 'Личный кабинет',
  };
}
