import { getRuntimeEnv } from '../core/runtimeEnv';
import { PIN_CODE_KEY } from '../../layouts/PortalLayout/constants';
import { DEFAULT_PROFILE_SNAPSHOT } from '../../features/profile/model/profileData';
import { createCompanyInvitation, readCurrentMembership, saveCurrentMembership } from './companyInvitationService';
import { recordCompanyActivity } from '../activity/companyActivityService';
import { getRoleLabel } from '../access/rbacService';
import { getAccountScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const PROFILE_ENDPOINT = String(getRuntimeEnv('PROFILE_ENDPOINT', getRuntimeEnv('API_BASE', '/api/v1'))).replace(/\/$/, '');
export const PROFILE_CACHE_KEY = 'business-shield:profile:snapshot:v1';
export const PROFILE_CHANGED_EVENT = 'business-shield:profile-changed';



function readCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null');
  } catch {
    return null;
  }
}

function overlayCurrentUserPersonal(snapshot) {
  const currentUser = readCurrentUser();
  if (!currentUser) return snapshot;
  return normalizeSnapshot({
    ...snapshot,
    personal: {
      ...snapshot.personal,
      ...(currentUser.firstName ? { firstName: currentUser.firstName } : {}),
      ...(currentUser.lastName ? { lastName: currentUser.lastName } : {}),
      ...(currentUser.email ? { email: currentUser.email } : {}),
      ...(currentUser.phone ? { phone: currentUser.phone } : {}),
    },
  });
}

function mirrorPersonalToCurrentUser(personal) {
  const currentUser = readCurrentUser();
  if (!currentUser) return;
  try {
    localStorage.setItem('currentUser', JSON.stringify({
      ...currentUser,
      firstName: personal.firstName || currentUser.firstName || '',
      lastName: personal.lastName || currentUser.lastName || '',
      email: personal.email || currentUser.email || '',
      phone: personal.phone || currentUser.phone || '',
    }));
  } catch {
    // Profile storage remains the source of truth for the current session.
  }
}

function readLegacyOrganization() {
  try {
    const raw = localStorage.getItem('organization');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function mapOrganizationToProfileCompany(organization = {}) {
  return {
    title: organization.title || 'Организация',
    inn: organization.inn || '',
    kpp: organization.kpp || '',
    ogrn: organization.ogrn || '',
    legalAddress: organization.address || organization.legalAddress || '',
    registrationDate: organization.registrationDate || '',
    registryStatus: organization.status || organization.registryStatus || '',
    registrySource: organization.source || organization.registrySource || '',
    verified: Boolean(organization.confirmed ?? organization.verified),
  };
}

function writeOrganizationMirror(company) {
  try {
    const previous = readLegacyOrganization() || {};
    const organization = {
      ...previous,
      type: String(company.inn || '').length === 12 ? 'ip' : 'ul',
      title: company.title || previous.title || 'Организация',
      inn: company.inn || '',
      kpp: company.kpp || '',
      ogrn: company.ogrn || '',
      address: company.legalAddress || '',
      registrationDate: company.registrationDate || '',
      status: company.registryStatus || '',
      source: company.registrySource || '',
      confirmed: Boolean(company.verified),
    };
    localStorage.setItem('organization', JSON.stringify(organization));
    window.dispatchEvent(new CustomEvent('business-shield:organization-changed', { detail: { organization } }));
  } catch {
    // Organization mirror will be rebuilt on the next successful profile save.
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyProfileSnapshot() {
  return {
    version: 1,
    personal: {
      firstName: '', lastName: '', email: '', phone: '', position: '', telegram: '', avatar: '',
      stats: { reports: 0, score: 0, days: 0 },
      notifications: { email: true, telegram: false, push: false },
    },
    company: {
      title: '', inn: '', kpp: '', ogrn: '', legalAddress: '', registrationDate: '',
      registryStatus: '', registrySource: '', verified: false, website: '', industry: '',
    },
    sessions: [],
    users: [],
  };
}

function createBaseProfileSnapshot() {
  return isDemoDataEnabled() ? clone(DEFAULT_PROFILE_SNAPSHOT) : createEmptyProfileSnapshot();
}

function readCache() {
  return readScopedJson(PROFILE_CACHE_KEY, { scope: getAccountScope(), legacy: true, fallback: null });
}

function writeCache(snapshot, { emit = true } = {}) {
  writeScopedJson(PROFILE_CACHE_KEY, snapshot, { scope: getAccountScope() });
  if (emit && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));
}

async function request(path = '', options = {}) {
  if (!PROFILE_ENDPOINT) return null;
  return apiRequest(joinEndpoint(PROFILE_ENDPOINT, path), { ...options, timeout: 9000 });
}

function normalizeSnapshot(value) {
  const base = createBaseProfileSnapshot();
  return {
    ...base,
    ...(value || {}),
    personal: {
      ...base.personal,
      ...(value?.personal || {}),
      stats: {
        ...base.personal.stats,
        ...(value?.personal?.stats || {}),
      },
    },
    company: {
      ...base.company,
      ...(value?.company || {}),
    },
    sessions: Array.isArray(value?.sessions) ? value.sessions : base.sessions,
    users: Array.isArray(value?.users) ? value.users : base.users,
  };
}

export async function getProfileSnapshot({ signal } = {}) {
  let remote = null;
  try {
    remote = await request('/company/profile', { signal });
  } catch (error) {
    throw error;
  }
  if (remote) {
    const snapshot = overlayCurrentUserPersonal(normalizeSnapshot({ ...(readCache() || {}), company: remote.company }));
    writeCache(snapshot, { emit: false });
    return snapshot;
  }

  const cached = readCache();
  if (cached) return overlayCurrentUserPersonal(normalizeSnapshot(cached));

  const legacyOrganization = readLegacyOrganization();
  if (legacyOrganization?.title) {
    const hydrated = normalizeSnapshot({
      ...createBaseProfileSnapshot(),
      company: {
        ...createBaseProfileSnapshot().company,
        ...mapOrganizationToProfileCompany(legacyOrganization),
      },
    });
    const personalized = overlayCurrentUserPersonal(hydrated);
    writeCache(personalized, { emit: false });
    return personalized;
  }

  return overlayCurrentUserPersonal(normalizeSnapshot(createBaseProfileSnapshot()));
}

export async function savePersonalProfile(personal, snapshot) {
  const remote = await request('/personal', {
    method: 'PATCH',
    body: JSON.stringify(personal),
  });

  if (remote) {
    const normalized = normalizeSnapshot(remote.snapshot || remote);
    writeCache(normalized);
    mirrorPersonalToCurrentUser(normalized.personal);
    return normalized;
  }

  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    personal: {
      ...snapshot.personal,
      ...personal,
    },
  });

  writeCache(nextSnapshot);
  mirrorPersonalToCurrentUser(nextSnapshot.personal);
  return nextSnapshot;
}

export async function saveCompanyProfile(company, snapshot) {
  const remote = await request('/company/profile', {
    method: 'PATCH',
    body: JSON.stringify(company),
  });

  if (remote) {
    const normalized = normalizeSnapshot({ ...snapshot, company: remote.company || remote.snapshot?.company });
    writeCache(normalized);
    writeOrganizationMirror(normalized.company);
    return normalized;
  }

  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    company: {
      ...snapshot.company,
      ...company,
    },
  });

  writeCache(nextSnapshot);

  writeOrganizationMirror(nextSnapshot.company);

  return nextSnapshot;
}


export async function syncProfileCompanyFromOnboarding(organization) {
  const current = normalizeSnapshot(readCache() || createBaseProfileSnapshot());
  const company = {
    ...current.company,
    ...mapOrganizationToProfileCompany(organization),
  };
  const localSnapshot = normalizeSnapshot({ ...current, company });

  // Persist locally first so onboarding completion never depends on a secondary API call.
  writeCache(localSnapshot);
  writeOrganizationMirror(localSnapshot.company);

  if (!PROFILE_ENDPOINT) return localSnapshot;

  try {
    const remote = await request('/company/profile', {
      method: 'PATCH',
      body: JSON.stringify(company),
    });
    if (!remote) return localSnapshot;
    const normalized = normalizeSnapshot({ ...current, company: remote.company || remote.snapshot?.company });
    writeCache(normalized);
    writeOrganizationMirror(normalized.company);
    return normalized;
  } catch {
    // Local configuration remains valid and can be synchronized by a later profile save.
    return localSnapshot;
  }
}

export async function changeProfilePin({ currentPin, newPin }) {
  const remote = await request('/security/pin', {
    method: 'PATCH',
    body: JSON.stringify({ currentPin, newPin }),
  });

  if (!remote) {
    const savedPin = localStorage.getItem(PIN_CODE_KEY) || '';
    if (!savedPin || savedPin !== currentPin) {
      const error = new Error('Текущий PIN указан неверно');
      error.code = 'INVALID_PIN';
      throw error;
    }
  }

  localStorage.setItem(PIN_CODE_KEY, newPin);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));
  recordCompanyActivity({ type: 'security_pin_changed', title: 'Изменён PIN-код', detail: 'Локальная защита кабинета обновлена', tone: 'success' });
  return { success: true };
}

export async function revokeProfileSession(sessionId, snapshot) {
  const remote = await request(`/sessions/${sessionId}`, { method: 'DELETE' });

  if (remote) {
    const normalized = normalizeSnapshot(remote.snapshot || remote);
    writeCache(normalized);
    return normalized;
  }

  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    sessions: snapshot.sessions.filter((session) => session.id !== sessionId),
  });
  writeCache(nextSnapshot);
  return nextSnapshot;
}

export async function revokeOtherProfileSessions(snapshot) {
  const remote = await request('/sessions', { method: 'DELETE' });

  if (remote) {
    const normalized = normalizeSnapshot(remote.snapshot || remote);
    writeCache(normalized);
    return normalized;
  }

  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    sessions: snapshot.sessions.filter((session) => session.current),
  });
  writeCache(nextSnapshot);
  return nextSnapshot;
}

export async function inviteProfileUser(payload, snapshot) {
  const invitation = await createCompanyInvitation(payload, snapshot.company);
  const name = payload.name.trim();
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join('')
    .toUpperCase();

  const user = {
    id: `user-${Date.now()}`,
    initials: initials || 'НП',
    name,
    subtitle: 'Ожидает принятия приглашения',
    email: payload.email.trim(),
    role: payload.role,
    accessRoleId: payload.role,
    permissionOverrides: payload.permissionOverrides || { allow: [], deny: [] },
    accessExpiresAt: payload.accessExpiresAt || null,
    securityStatus: 'active',
    sessionRevision: 0,
    active: false,
    tone: 'cyan',
    invitationStatus: 'pending',
    inviteToken: invitation.token,
    inviteUrl: invitation.inviteUrl,
    invitedAt: invitation.createdAt,
    invitationExpiresAt: invitation.expiresAt,
  };

  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    users: [...snapshot.users.filter((item) => item.email !== user.email), user],
  });
  writeCache(nextSnapshot);
  recordCompanyActivity({ type: 'member_invited', title: `Приглашён ${name}`, detail: `${payload.email.trim()} · ${getRoleLabel(payload.role)}`, tone: 'violet', targetId: user.id });
  return { snapshot: nextSnapshot, invitation };
}

export async function updateProfileUser(userId, patch, snapshot) {
  const remote = await request(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  if (remote) {
    const normalized = normalizeSnapshot(remote.snapshot || remote);
    writeCache(normalized);
    return normalized;
  }

  const previousUser = snapshot.users.find((user) => user.id === userId);
  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    users: snapshot.users.map((user) => user.id === userId ? { ...user, ...patch } : user),
  });
  writeCache(nextSnapshot);
  if (previousUser) {
    const currentUser = readCurrentUser();
    const currentMembership = readCurrentMembership();
    const sameCurrentMember = String(previousUser.email || '').trim().toLowerCase()
      && String(previousUser.email || '').trim().toLowerCase() === String(currentUser?.email || currentMembership?.email || '').trim().toLowerCase();
    if (sameCurrentMember) {
      const membershipPatch = {
        ...(Object.prototype.hasOwnProperty.call(patch, 'role') ? { role: patch.role } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'accessRoleId') ? { accessRoleId: patch.accessRoleId } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'permissionOverrides') ? { permissionOverrides: patch.permissionOverrides } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'securityStatus') ? { securityStatus: patch.securityStatus } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'accessExpiresAt') ? { accessExpiresAt: patch.accessExpiresAt } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'sessionRevision') ? { sessionRevision: patch.sessionRevision } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, 'lastForcedLogoutAt') ? { lastForcedLogoutAt: patch.lastForcedLogoutAt } : {}),
      };
      if (Object.keys(membershipPatch).length) {
        const nextMembership = { ...(currentMembership || currentUser?.membership || {}), ...membershipPatch };
        saveCurrentMembership(nextMembership);
        if (currentUser) localStorage.setItem('currentUser', JSON.stringify({ ...currentUser, membership: nextMembership }));
      }
    }
    const roleChanged = (patch.accessRoleId || patch.role) && (patch.accessRoleId || patch.role) !== (previousUser.accessRoleId || previousUser.role);
    const permissionsChanged = Object.prototype.hasOwnProperty.call(patch, 'permissionOverrides');
    const activeChanged = Object.prototype.hasOwnProperty.call(patch, 'active');
    const securityChanged = Object.prototype.hasOwnProperty.call(patch, 'securityStatus')
      || Object.prototype.hasOwnProperty.call(patch, 'accessExpiresAt')
      || Object.prototype.hasOwnProperty.call(patch, 'sessionRevision')
      || Object.prototype.hasOwnProperty.call(patch, 'lastForcedLogoutAt');
    if (!securityChanged) {
      recordCompanyActivity({
        type: roleChanged ? 'member_role_changed' : permissionsChanged ? 'member_permissions_changed' : activeChanged ? 'member_status_changed' : 'member_updated',
        title: roleChanged ? `Изменена роль ${previousUser.name}` : permissionsChanged ? `Изменены права ${previousUser.name}` : activeChanged ? `${patch.active ? 'Восстановлен' : 'Приостановлен'} доступ ${previousUser.name}` : `Обновлён профиль ${previousUser.name}`,
        detail: roleChanged ? getRoleLabel(patch.accessRoleId || patch.role) : '',
        tone: roleChanged || permissionsChanged ? 'violet' : 'neutral',
        targetId: userId,
      });
    }
  }
  return nextSnapshot;
}

export async function removeProfileUser(userId, snapshot) {
  const remote = await request(`/users/${userId}`, { method: 'DELETE' });

  if (remote) {
    const normalized = normalizeSnapshot(remote.snapshot || remote);
    writeCache(normalized);
    return normalized;
  }

  const removedUser = snapshot.users.find((user) => user.id === userId);
  const nextSnapshot = normalizeSnapshot({
    ...snapshot,
    users: snapshot.users.filter((user) => user.id !== userId),
  });
  writeCache(nextSnapshot);
  if (removedUser) recordCompanyActivity({ type: 'member_removed', title: `Отозван доступ ${removedUser.name}`, detail: removedUser.email || '', tone: 'danger', targetId: userId });
  return nextSnapshot;
}
