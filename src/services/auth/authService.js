import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { COMPANY_MEMBERSHIP_KEY, COMPANY_MEMBERSHIP_CHANGED_EVENT } from '../profile/companyInvitationService';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');
const SESSION_CHANGED_EVENT = 'business-shield:auth-session-changed';

const clearLocalSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
  localStorage.removeItem(COMPANY_MEMBERSHIP_KEY);
  window.dispatchEvent(new CustomEvent(COMPANY_MEMBERSHIP_CHANGED_EVENT, { detail: null }));
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: null }));
};

const requestJson = async (path, options = {}, timeoutMs = 6000) => {
  if (!API_BASE) throw new TypeError('Auth API is not configured');
  return apiRequest(joinEndpoint(API_BASE, path), { ...options, timeout: timeoutMs });
};

function directContextFromMembership(membership) {
  if (!membership?.id || !membership?.organizationId) return null;
  return {
    organizationId: membership.organizationId,
    membershipId: membership.id,
    role: membership.role || null,
    permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
    accessMode: 'DIRECT',
    agencyOrganizationId: null,
    delegatedGrantId: null,
    agencyClientLinkId: null,
  };
}

export const authService = {
  async requestCode({ phone, mode, planId, invitationToken }) {
    return requestJson('/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, mode, tariff: planId || null, invitation_token: invitationToken || null }),
    });
  },

  async verifyCode({ phone, code, sessionId, mode, invitationToken }) {
    return requestJson('/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, session_id: sessionId, mode, invitation_token: invitationToken || null }),
    });
  },

  async register({ phone, firstName, lastName, email, plan, invitationToken }) {
    return requestJson('/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          first_name: firstName,
          last_name: lastName,
          email,
          tariff: plan?.id || null,
          invitation_token: invitationToken || null,
        }),
    });
  },

  persistSession({ user, organizationContext = null }) {
    localStorage.removeItem('token');
    if (user) {
      const sessionEstablishedAt = new Date().toISOString();
      const resolvedOrganizationContext = organizationContext
        || user.organizationContext
        || directContextFromMembership(user.membership)
        || null;
      const normalizedUser = {
        ...user,
        organizationContext: resolvedOrganizationContext,
        authSessionStartedAt: sessionEstablishedAt,
        ...(user.membership ? {
          membership: {
            ...user.membership,
            sessionEstablishedAt,
          },
        } : { membership: null }),
      };
      localStorage.setItem('currentUser', JSON.stringify(normalizedUser));
      if (normalizedUser.membership) {
        localStorage.setItem(COMPANY_MEMBERSHIP_KEY, JSON.stringify(normalizedUser.membership));
        const organization = normalizedUser.membership.organization || {};
        if (organization.onboardingStatus === 'COMPLETED') localStorage.setItem('onboarding_completed', '1');
        else localStorage.removeItem('onboarding_completed');
        if (organization.id || organization.name) {
          const compatibleOrganization = {
            id: organization.id || normalizedUser.membership.organizationId,
            title: organization.name || organization.title || 'Организация',
            name: organization.name || organization.title || 'Организация',
            onboardingStatus: organization.onboardingStatus || 'NOT_STARTED',
          };
          localStorage.setItem('organization', JSON.stringify(compatibleOrganization));
          window.dispatchEvent(new CustomEvent('business-shield:organization-changed', { detail: { organization: compatibleOrganization } }));
        }
        window.dispatchEvent(new CustomEvent(COMPANY_MEMBERSHIP_CHANGED_EVENT, { detail: normalizedUser.membership }));
      } else {
        localStorage.removeItem(COMPANY_MEMBERSHIP_KEY);
        window.dispatchEvent(new CustomEvent(COMPANY_MEMBERSHIP_CHANGED_EVENT, { detail: null }));
      }
      window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: normalizedUser }));
    }
  },

  async restoreSession({ signal } = {}) {
    const payload = await requestJson('/me', { signal });
    const user = payload?.user || null;
    if (!user) throw new Error('Сессия не содержит пользователя');
    const organizationContext = payload?.organizationContext || null;
    const hasDirectMembership = Boolean(organizationContext?.membershipId);
    const membership = user.membership || (hasDirectMembership ? {
      id: organizationContext.membershipId,
      organizationId: organizationContext.organizationId,
      role: organizationContext.role,
      permissions: organizationContext.permissions,
    } : null);
    const normalized = { ...user, membership, organizationContext };
    this.persistSession({ user: normalized, organizationContext });
    return normalized;
  },

  async logout() {
    await requestJson('/auth/logout', { method: 'POST', responseType: 'none' });
    clearLocalSession();
  },

  async logoutAll() {
    const result = await requestJson('/auth/logout-all', { method: 'POST' });
    clearLocalSession();
    return result;
  },

  clearLocalSession,
};

export { SESSION_CHANGED_EVENT };
