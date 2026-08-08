import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { COMPANY_MEMBERSHIP_KEY, COMPANY_MEMBERSHIP_CHANGED_EVENT } from '../profile/companyInvitationService';

const API_BASE = String(getRuntimeEnv('API_BASE')).replace(/\/$/, '');
const USERS_KEY = 'business-shield:auth-users:v1';
const DEMO_CODE = '1111';

const readUsers = () => {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
};

const writeUsers = (users) => localStorage.setItem(USERS_KEY, JSON.stringify(users));
const isNetworkError = (error) => error instanceof TypeError || error?.name === 'AbortError' || /network|fetch|failed|abort/i.test(error?.message || '');
const createToken = () => `demo-token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createSession = () => `demo-session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const requestJson = async (path, options = {}, timeoutMs = 6000) => {
  if (!API_BASE) throw new TypeError('Auth API is not configured');
  return apiRequest(joinEndpoint(API_BASE, path), { ...options, timeout: timeoutMs });
};

export const authService = {
  demoCode: DEMO_CODE,

  async requestCode({ phone, mode, planId, invitationToken }) {
    try {
      return await requestJson('/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, mode, tariff: planId || null, invitation_token: invitationToken || null }),
      });
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      return { session_id: createSession(), demo: true, debug_code: DEMO_CODE };
    }
  },

  async verifyCode({ phone, code, sessionId, mode, invitationToken }) {
    try {
      return await requestJson('/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, session_id: sessionId, mode, invitation_token: invitationToken || null }),
      });
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      if (code !== DEMO_CODE) throw new Error('Неверный код. В демо-режиме используйте 1111.');

      const existing = readUsers().find((user) => user.phone === phone)
        || (() => {
          try {
            const current = JSON.parse(localStorage.getItem('currentUser') || 'null');
            return current?.phone === phone ? current : null;
          } catch { return null; }
        })();

      if (mode === 'login' && !existing) return { demo: true, needs_registration: true };

      const token = createToken();
      return { demo: true, token, user: existing || null, needs_registration: false };
    }
  },

  async register({ phone, firstName, lastName, email, plan, token, invitationToken }) {
    try {
      return await requestJson('/auth/complete-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phone,
          first_name: firstName,
          last_name: lastName,
          email,
          tariff: plan?.id || null,
          invitation_token: invitationToken || null,
        }),
      });
    } catch (error) {
      if (!isNetworkError(error)) throw error;

      const users = readUsers();
      const user = {
        id: `local-${Date.now()}`,
        phone,
        firstName,
        lastName,
        email,
        plan: plan || null,
        invitationToken: invitationToken || null,
        createdAt: new Date().toISOString(),
      };
      const nextUsers = [...users.filter((item) => item.phone !== phone), user];
      writeUsers(nextUsers);
      return { demo: true, token: token || createToken(), user };
    }
  },

  persistSession({ token, user }) {
    if (token) localStorage.setItem('token', token);
    if (user) {
      const sessionEstablishedAt = new Date().toISOString();
      const normalizedUser = {
        ...user,
        authSessionStartedAt: sessionEstablishedAt,
        ...(user.membership ? {
          membership: {
            ...user.membership,
            sessionEstablishedAt,
          },
        } : {}),
      };
      localStorage.setItem('currentUser', JSON.stringify(normalizedUser));
      if (normalizedUser.phone) {
        const users = readUsers();
        writeUsers([...users.filter((item) => item.phone !== normalizedUser.phone), normalizedUser]);
      }
      if (normalizedUser.membership) {
        localStorage.setItem(COMPANY_MEMBERSHIP_KEY, JSON.stringify(normalizedUser.membership));
        localStorage.setItem('onboarding_completed', '1');
        window.dispatchEvent(new CustomEvent(COMPANY_MEMBERSHIP_CHANGED_EVENT, { detail: normalizedUser.membership }));
      } else {
        localStorage.removeItem(COMPANY_MEMBERSHIP_KEY);
        window.dispatchEvent(new CustomEvent(COMPANY_MEMBERSHIP_CHANGED_EVENT, { detail: null }));
      }
    }
  },
};
