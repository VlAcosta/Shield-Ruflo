import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';
const INVITATIONS_ENDPOINT = String(getRuntimeEnv('COMPANY_INVITATIONS_ENDPOINT')).replace(/\/$/, '');
export const COMPANY_INVITATIONS_KEY = 'business-shield:company-invitations:v1';
export const COMPANY_MEMBERSHIP_KEY = 'business-shield:company-membership:v1';
export const COMPANY_MEMBERSHIP_CHANGED_EVENT = 'business-shield:company-membership-changed';
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const clone = (value) => JSON.parse(JSON.stringify(value));

function readInvitations() {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(COMPANY_INVITATIONS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeInvitations(invitations) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COMPANY_INVITATIONS_KEY, JSON.stringify(invitations));
  } catch {
    // Demo invitations remain available in memory only when storage is unavailable.
  }
}

function createToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function buildInviteUrl(token) {
  if (typeof window === 'undefined') return `/auth?invite=${encodeURIComponent(token)}`;
  return `${window.location.origin}/auth?invite=${encodeURIComponent(token)}`;
}

function normalizeInvitation(value = {}) {
  const token = value.token || value.invitation_token || '';
  const company = value.company || value.organization || {};
  return {
    token,
    email: value.email || '',
    name: value.name || value.full_name || '',
    role: value.role || value.accessRoleId || 'guest',
    accessRoleId: value.accessRoleId || value.access_role_id || value.role || 'guest',
    permissionOverrides: value.permissionOverrides || value.permission_overrides || { allow: [], deny: [] },
    accessExpiresAt: value.accessExpiresAt || value.access_expires_at || null,
    status: value.status || 'pending',
    company: {
      title: company.title || company.name || 'Компания',
      inn: company.inn || '',
      kpp: company.kpp || '',
      ogrn: company.ogrn || '',
      legalAddress: company.legalAddress || company.legal_address || company.address || '',
      verified: Boolean(company.verified ?? company.confirmed ?? true),
    },
    createdAt: value.createdAt || value.created_at || new Date().toISOString(),
    expiresAt: value.expiresAt || value.expires_at || new Date(Date.now() + INVITE_LIFETIME_MS).toISOString(),
    acceptedAt: value.acceptedAt || value.accepted_at || null,
    inviteUrl: value.inviteUrl || value.invite_url || (token ? buildInviteUrl(token) : ''),
    demo: Boolean(value.demo),
  };
}

function isExpired(invitation) {
  const expiresAt = new Date(invitation?.expiresAt || 0).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function request(path = '', options = {}) {
  if (!INVITATIONS_ENDPOINT) return null;
  return apiRequest(joinEndpoint(INVITATIONS_ENDPOINT, path), { ...options, timeout: 9000 });
}

export async function createCompanyInvitation(payload, company = {}) {
  const remote = await request('', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      role: payload.role,
      accessRoleId: payload.role,
      permissionOverrides: payload.permissionOverrides || { allow: [], deny: [] },
      accessExpiresAt: payload.accessExpiresAt || null,
      company,
    }),
  });

  if (remote) return normalizeInvitation(remote.invitation || remote);

  const token = createToken();
  const invitation = normalizeInvitation({
    token,
    name: String(payload.name || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    role: payload.role || 'guest',
    accessRoleId: payload.role || 'guest',
    permissionOverrides: payload.permissionOverrides || { allow: [], deny: [] },
    accessExpiresAt: payload.accessExpiresAt || null,
    status: 'pending',
    company,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS).toISOString(),
    demo: true,
  });

  const current = readInvitations();
  writeInvitations([
    invitation,
    ...current.filter((item) => item.token !== token && item.email !== invitation.email),
  ].slice(0, 60));

  return clone(invitation);
}

export async function getCompanyInvitation(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) throw new Error('Ссылка приглашения повреждена');

  const remote = await request(`/${encodeURIComponent(normalizedToken)}`);
  const invitation = remote
    ? normalizeInvitation(remote.invitation || remote)
    : normalizeInvitation(readInvitations().find((item) => item.token === normalizedToken) || {});

  if (!invitation.token) throw new Error('Приглашение не найдено или уже недоступно');
  if (invitation.status === 'accepted') throw new Error('Это приглашение уже использовано');
  if (invitation.status === 'revoked') throw new Error('Приглашение было отозвано администратором');
  if (isExpired(invitation)) throw new Error('Срок действия приглашения истёк');
  return invitation;
}

export async function acceptCompanyInvitation(token, user = {}) {
  const normalizedToken = String(token || '').trim();
  const remote = await request(`/${encodeURIComponent(normalizedToken)}/accept`, {
    method: 'POST',
    body: JSON.stringify({ user }),
  });

  if (remote) {
    const membership = { ...(remote.membership || remote) };
    membership.accessRoleId = membership.accessRoleId || membership.access_role_id || membership.role || 'guest';
    membership.permissionOverrides = membership.permissionOverrides || membership.permission_overrides || { allow: [], deny: [] };
    saveCurrentMembership(membership);
    return membership;
  }

  const invitations = readInvitations();
  const index = invitations.findIndex((item) => item.token === normalizedToken);
  if (index < 0) throw new Error('Приглашение не найдено');
  const invitation = normalizeInvitation(invitations[index]);
  if (isExpired(invitation)) throw new Error('Срок действия приглашения истёк');
  if (invitation.status !== 'pending') throw new Error('Приглашение уже недоступно');

  const accepted = {
    ...invitation,
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
  };
  invitations[index] = accepted;
  writeInvitations(invitations);

  const membership = {
    id: `membership-${accepted.token.slice(0, 10)}`,
    role: accepted.role,
    accessRoleId: accepted.accessRoleId || accepted.role,
    permissionOverrides: accepted.permissionOverrides || { allow: [], deny: [] },
    accessExpiresAt: accepted.accessExpiresAt || null,
    securityStatus: 'active',
    sessionRevision: 0,
    email: accepted.email || user.email || '',
    company: accepted.company,
    joinedAt: accepted.acceptedAt,
    invitationToken: accepted.token,
  };
  saveCurrentMembership(membership);
  try {
    // Profile caches are account-scoped since A20. In local demo mode the invite
    // may be accepted in another account context, so update any cached company
    // profile that already contains this member instead of writing a global key.
    const prefix = 'business-shield:profile:snapshot:v1:account-';
    const email = String(accepted.email || '').toLowerCase();
    for (let index = 0; index < localStorage.length; index += 1) {
      const profileKey = localStorage.key(index);
      if (!profileKey?.startsWith(prefix)) continue;
      const snapshot = JSON.parse(localStorage.getItem(profileKey) || 'null');
      if (!snapshot?.users?.length) continue;
      const hasMember = snapshot.users.some((member) => String(member.email || '').toLowerCase() === email);
      if (!hasMember) continue;
      snapshot.users = snapshot.users.map((member) => String(member.email || '').toLowerCase() === email ? {
        ...member,
        role: membership.accessRoleId,
        accessRoleId: membership.accessRoleId,
        permissionOverrides: membership.permissionOverrides,
        accessExpiresAt: membership.accessExpiresAt || null,
        securityStatus: 'active',
        sessionRevision: membership.sessionRevision || 0,
        active: true,
        invitationStatus: 'accepted',
        subtitle: 'Участник команды',
        joinedAt: membership.joinedAt,
        lastLoginAt: membership.joinedAt,
      } : member);
      localStorage.setItem(profileKey, JSON.stringify(snapshot));
    }
    window.dispatchEvent(new CustomEvent('business-shield:profile-changed'));
  } catch {
    // Backend remains the source of truth when local synchronization is unavailable.
  }
  return membership;
}

export function saveCurrentMembership(membership) {
  if (typeof window === 'undefined' || !membership) return membership;
  const normalized = {
    ...membership,
    company: { ...(membership.company || {}) },
  };
  try {
    localStorage.setItem(COMPANY_MEMBERSHIP_KEY, JSON.stringify(normalized));
  } catch {
    // The current session can still use the membership object.
  }
  window.dispatchEvent(new CustomEvent(COMPANY_MEMBERSHIP_CHANGED_EVENT, { detail: { membership: normalized } }));
  return normalized;
}

export function readCurrentMembership() {
  if (typeof window === 'undefined') return null;
  try {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (currentUser?.membership) return currentUser.membership;
    return JSON.parse(localStorage.getItem(COMPANY_MEMBERSHIP_KEY) || 'null');
  } catch {
    return null;
  }
}

export function getMembershipCapabilities(membership = readCurrentMembership()) {
  const role = membership?.role || 'owner';
  return {
    role,
    canManageCompany: role === 'owner' || role === 'admin',
    canManageUsers: role === 'owner' || role === 'admin',
    canEditWorkspace: role !== 'guest',
    canOperateTasks: role !== 'guest',
  };
}
