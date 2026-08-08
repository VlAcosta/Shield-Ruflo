import { getRuntimeEnv } from '../core/runtimeEnv';
import {
  COMPANY_MEMBERSHIP_CHANGED_EVENT,
  COMPANY_MEMBERSHIP_KEY,
  readCurrentMembership,
} from '../profile/companyInvitationService';
import { recordCompanyActivity } from '../activity/companyActivityService';
import { PIN_UNLOCK_KEY } from '../../layouts/PortalLayout/constants';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';

const TEAM_SECURITY_ENDPOINT = String(getRuntimeEnv('TEAM_SECURITY_ENDPOINT')).replace(/\/$/, '');
export const TEAM_SECURITY_KEY = 'business-shield:team-security:v1';
export const TEAM_SECURITY_CHANGED_EVENT = 'business-shield:team-security-changed';
const SESSION_ID_PREFIX = 'business-shield:member-session-id:';
const MAX_SESSIONS_PER_MEMBER = 12;
const SESSION_ACTIVE_WINDOW_MS = 4 * 60 * 1000;

const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();

function readJson(key, fallback) {
  return readScopedJson(key, { scope: getCompanyScope(), legacy: true, fallback });
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function memberKey(member = {}) {
  return normalizeEmail(member.email) || String(member.id || member.userId || '').trim() || 'unknown-member';
}

function normalizeState(value) {
  const members = value?.members && typeof value.members === 'object' && !Array.isArray(value.members)
    ? value.members
    : {};
  return {
    version: 1,
    members,
    updatedAt: value?.updatedAt || null,
  };
}

export function readTeamSecurityState() {
  return normalizeState(readJson(TEAM_SECURITY_KEY, { version: 1, members: {} }));
}

function writeTeamSecurityState(nextState) {
  if (typeof window === 'undefined') return nextState;
  const normalized = normalizeState({ ...nextState, updatedAt: nowIso() });
  writeScopedJson(TEAM_SECURITY_KEY, normalized, { scope: getCompanyScope() });
  window.dispatchEvent(new CustomEvent(TEAM_SECURITY_CHANGED_EVENT, { detail: clone(normalized) }));
  return normalized;
}

function normalizeMemberSecurity(member = {}, value = {}) {
  return {
    memberId: value.memberId || member.id || member.userId || '',
    email: normalizeEmail(value.email || member.email),
    status: value.status || member.securityStatus || (member.active === false ? 'frozen' : 'active'),
    frozenAt: value.frozenAt || member.frozenAt || null,
    frozenBy: value.frozenBy || null,
    frozenReason: value.frozenReason || member.frozenReason || '',
    accessExpiresAt: value.accessExpiresAt || member.accessExpiresAt || null,
    forcedLogoutAt: value.forcedLogoutAt || member.lastForcedLogoutAt || null,
    sessionRevision: Number(value.sessionRevision ?? member.sessionRevision ?? 0),
    sessions: Array.isArray(value.sessions) ? value.sessions : [],
    updatedAt: value.updatedAt || null,
  };
}

export function getMemberSecurity(member = {}, state = readTeamSecurityState()) {
  const key = memberKey(member);
  return normalizeMemberSecurity(member, state.members[key] || {});
}

function updateMemberState(member, updater) {
  const state = readTeamSecurityState();
  const key = memberKey(member);
  const previous = getMemberSecurity(member, state);
  const nextMember = normalizeMemberSecurity(member, {
    ...previous,
    ...(typeof updater === 'function' ? updater(previous) : updater),
    updatedAt: nowIso(),
  });
  const nextState = writeTeamSecurityState({ ...state, members: { ...state.members, [key]: nextMember } });
  return clone(nextState.members[key]);
}

async function request(path = '', options = {}) {
  if (!TEAM_SECURITY_ENDPOINT) return null;
  return apiRequest(joinEndpoint(TEAM_SECURITY_ENDPOINT, path), { ...options, timeout: 9000 });
}

export async function refreshTeamSecurityState() {
  const remote = await request('', { method: 'GET' });
  if (!remote) return readTeamSecurityState();
  const payload = remote.security || remote;
  let members = payload.members || {};
  if (Array.isArray(members)) {
    members = members.reduce((map, item) => {
      const key = memberKey(item);
      if (key && key !== 'unknown-member') map[key] = normalizeMemberSecurity(item, item);
      return map;
    }, {});
  } else if (members && typeof members === 'object') {
    members = Object.entries(members).reduce((map, [sourceKey, item]) => {
      const key = memberKey(item || {}) !== 'unknown-member' ? memberKey(item || {}) : sourceKey;
      map[key] = normalizeMemberSecurity(item || { id: sourceKey }, item || {});
      return map;
    }, {});
  }
  return writeTeamSecurityState({ version: 1, members });
}

function formatDevice() {
  if (typeof navigator === 'undefined') return { deviceType: 'desktop', browser: 'Браузер', os: 'Устройство' };
  const ua = navigator.userAgent || '';
  const deviceType = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari'
          : 'Браузер';
  const os = /Windows NT 10/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
      : /Android/.test(ua) ? 'Android'
        : /iPhone|iPad/.test(ua) ? 'iOS'
          : 'Устройство';
  return { deviceType, browser, os };
}

function readCurrentIdentity() {
  if (typeof window === 'undefined') return null;
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const membership = user?.membership || readCurrentMembership();
    if (!user && !membership) return null;
    return {
      id: membership?.userId || user?.id || '',
      email: normalizeEmail(membership?.email || user?.email),
      name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.name || membership?.email || 'Пользователь',
      membership,
      user,
    };
  } catch {
    return null;
  }
}

function getSessionStorageKey(identity) {
  const raw = identity?.email || identity?.id || 'current';
  return `${SESSION_ID_PREFIX}${raw.replace(/[^a-z0-9_-]/gi, '_')}`;
}

function getOrCreateSessionId(identity) {
  if (typeof window === 'undefined') return '';
  const key = getSessionStorageKey(identity);
  let id = '';
  try { id = sessionStorage.getItem(key) || ''; } catch { /* noop */ }
  if (!id) {
    id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try { sessionStorage.setItem(key, id); } catch { /* noop */ }
  }
  return id;
}

export function registerCurrentMemberSession(extra = {}) {
  const identity = readCurrentIdentity();
  if (!identity?.email) return null;
  const sessionId = getOrCreateSessionId(identity);
  const device = formatDevice();
  const security = updateMemberState(identity, (previous) => {
    const existing = previous.sessions.find((session) => session.id === sessionId);
    const session = {
      ...existing,
      id: sessionId,
      memberId: identity.id,
      email: identity.email,
      deviceType: device.deviceType,
      browser: device.browser,
      os: device.os,
      label: `${device.browser} · ${device.os}`,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      createdAt: existing?.createdAt || nowIso(),
      lastSeenAt: nowIso(),
      route: extra.route || existing?.route || '',
      ip: extra.ip || existing?.ip || '',
      location: extra.location || existing?.location || '',
      revokedAt: null,
      revision: previous.sessionRevision,
    };
    return {
      sessions: [session, ...previous.sessions.filter((item) => item.id !== sessionId)].slice(0, MAX_SESSIONS_PER_MEMBER),
    };
  });
  return security.sessions.find((session) => session.id === sessionId) || null;
}

export function touchCurrentMemberSession(extra = {}) {
  const identity = readCurrentIdentity();
  if (!identity?.email) return null;
  const sessionId = getOrCreateSessionId(identity);
  const state = readTeamSecurityState();
  const previous = getMemberSecurity(identity, state);
  if (!previous.sessions.some((session) => session.id === sessionId)) return registerCurrentMemberSession(extra);
  const security = updateMemberState(identity, {
    sessions: previous.sessions.map((session) => session.id === sessionId ? {
      ...session,
      lastSeenAt: nowIso(),
      route: extra.route || session.route || '',
    } : session),
  });
  return security.sessions.find((session) => session.id === sessionId) || null;
}

export function getMemberSessions(member = {}) {
  const security = getMemberSecurity(member);
  const currentIdentity = readCurrentIdentity();
  const currentSessionId = currentIdentity && memberKey(currentIdentity) === memberKey(member)
    ? getOrCreateSessionId(currentIdentity)
    : '';
  return security.sessions
    .map((session) => ({
      ...session,
      current: Boolean(currentSessionId && session.id === currentSessionId),
      online: !session.revokedAt && Date.now() - new Date(session.lastSeenAt || 0).getTime() <= SESSION_ACTIVE_WINDOW_MS,
    }))
    .sort((a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime());
}

export async function updateMemberSecurityPolicy(member, patch = {}) {
  const remote = await request(`/members/${encodeURIComponent(member.id || memberKey(member))}/security`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const payload = remote?.security || remote || patch;
  const next = updateMemberState(member, (previous) => ({ ...previous, ...payload }));
  const isFrozen = next.status === 'frozen';
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    recordCompanyActivity({
      type: isFrozen ? 'security_member_frozen' : 'security_member_unfrozen',
      title: isFrozen ? `Доступ ${member.name || member.email} заморожен` : `Доступ ${member.name || member.email} восстановлен`,
      detail: isFrozen ? (next.frozenReason || 'Без комментария') : 'Пользователь снова может входить в кабинет',
      tone: isFrozen ? 'danger' : 'success',
      targetId: member.id,
    });
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'accessExpiresAt')) {
    recordCompanyActivity({
      type: 'security_access_expiry_changed',
      title: patch.accessExpiresAt ? `Ограничен срок доступа ${member.name || member.email}` : `Снят срок временного доступа ${member.name || member.email}`,
      detail: patch.accessExpiresAt || 'Без ограничения срока',
      tone: patch.accessExpiresAt ? 'amber' : 'neutral',
      targetId: member.id,
    });
  }
  return next;
}

export async function forceLogoutMember(member) {
  const remote = await request(`/members/${encodeURIComponent(member.id || memberKey(member))}/sessions`, { method: 'DELETE' });
  const at = remote?.forcedLogoutAt || remote?.forced_logout_at || nowIso();
  const next = updateMemberState(member, (previous) => ({
    forcedLogoutAt: at,
    sessionRevision: Number(previous.sessionRevision || 0) + 1,
    sessions: previous.sessions.map((session) => ({ ...session, revokedAt: at })),
  }));
  recordCompanyActivity({
    type: 'security_force_logout',
    title: `Завершены все сессии ${member.name || member.email}`,
    detail: `${next.sessions.length} устройств отозвано`,
    tone: 'danger',
    targetId: member.id,
  });
  return next;
}

export async function revokeMemberSession(member, sessionId) {
  await request(`/members/${encodeURIComponent(member.id || memberKey(member))}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  const at = nowIso();
  const next = updateMemberState(member, (previous) => ({
    sessions: previous.sessions.map((session) => session.id === sessionId ? { ...session, revokedAt: at } : session),
  }));
  const session = next.sessions.find((item) => item.id === sessionId);
  recordCompanyActivity({
    type: 'security_session_revoked',
    title: `Завершена сессия ${member.name || member.email}`,
    detail: session?.label || 'Устройство отключено',
    tone: 'danger',
    targetId: member.id,
  });
  return next;
}

export function isAccessExpired(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

export function evaluateCurrentMemberSecurity() {
  const identity = readCurrentIdentity();
  const membership = identity?.membership;
  if (!identity || !membership) return { blocked: false, reason: '', security: null };
  const security = getMemberSecurity(identity);
  const sessionId = getOrCreateSessionId(identity);
  const session = security.sessions.find((item) => item.id === sessionId);
  const establishedAt = new Date(membership.sessionEstablishedAt || identity.user?.authSessionStartedAt || identity.user?.createdAt || 0).getTime();
  const forcedAt = Math.max(
    new Date(security.forcedLogoutAt || 0).getTime() || 0,
    new Date(membership.lastForcedLogoutAt || membership.forcedLogoutAt || 0).getTime() || 0,
  );
  const sessionRevokedAt = new Date(session?.revokedAt || 0).getTime();

  if (security.status === 'frozen' || membership.securityStatus === 'frozen' || membership.status === 'frozen') {
    return { blocked: true, reason: 'frozen', security };
  }
  if (isAccessExpired(security.accessExpiresAt || membership.accessExpiresAt)) {
    return { blocked: true, reason: 'expired', security };
  }
  if ((forcedAt && (!establishedAt || forcedAt >= establishedAt))
    || (sessionRevokedAt && (!establishedAt || sessionRevokedAt >= establishedAt))) {
    return { blocked: true, reason: 'revoked', security };
  }
  return { blocked: false, reason: '', security };
}

export function signOutCurrentSession() {
  if (typeof window === 'undefined') return;
  const identity = readCurrentIdentity();
  if (identity?.email) {
    const sessionId = getOrCreateSessionId(identity);
    const previous = getMemberSecurity(identity);
    updateMemberState(identity, {
      sessions: previous.sessions.map((session) => session.id === sessionId ? { ...session, revokedAt: nowIso() } : session),
    });
  }
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  localStorage.removeItem(COMPANY_MEMBERSHIP_KEY);
  localStorage.removeItem(PIN_UNLOCK_KEY);
  window.dispatchEvent(new CustomEvent(COMPANY_MEMBERSHIP_CHANGED_EVENT, { detail: null }));
}

export function getSecurityStatusLabel(member, security = getMemberSecurity(member)) {
  if (security.status === 'frozen') return { id: 'frozen', label: 'Заморожен', tone: 'danger' };
  if (isAccessExpired(security.accessExpiresAt)) return { id: 'expired', label: 'Срок истёк', tone: 'danger' };
  if (security.accessExpiresAt) return { id: 'temporary', label: 'Временный', tone: 'amber' };
  return { id: 'active', label: 'Активен', tone: 'success' };
}
