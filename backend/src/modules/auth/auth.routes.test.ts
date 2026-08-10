import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { browserSessionBody } from './auth.routes.js';
import { tokensFromRequest } from './auth.service.js';
import { env } from '../../config/env.js';
import { resolveActiveMembership } from '../../core/plugins/authentication.js';

describe('browser auth response security', () => {
  it('removes an opaque session token from OTP verification responses', () => {
    const body = browserSessionBody({
      ok: true,
      token: 'opaque-session-secret',
      expires_at: '2026-09-09T00:00:00.000Z',
      needs_registration: false,
      user: { id: 'user-1' },
    });

    expect(body).toEqual({
      ok: true,
      expires_at: '2026-09-09T00:00:00.000Z',
      needs_registration: false,
      user: { id: 'user-1' },
    });
    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain('opaque-session-secret');
  });

  it('removes an opaque session token from profile completion responses', () => {
    const body = browserSessionBody({
      ok: true,
      token: 'replacement-session-secret',
      expires_at: '2026-09-09T00:00:00.000Z',
      user: { id: 'user-1' },
    });

    expect(body).not.toHaveProperty('token');
    expect(JSON.stringify(body)).not.toContain('replacement-session-secret');
  });
});

describe('logout credential collection', () => {
  function requestWithHeaders(headers: Record<string, string>): FastifyRequest {
    return { headers } as unknown as FastifyRequest;
  }

  it('collects both bearer and cookie credentials so logout revokes both', () => {
    const request = requestWithHeaders({
      authorization: 'Bearer bearer-secret',
      cookie: `${env.AUTH_COOKIE_NAME}=cookie-secret`,
    });

    expect(tokensFromRequest(request)).toEqual(['bearer-secret', 'cookie-secret']);
  });

  it('deduplicates the same credential presented twice', () => {
    const request = requestWithHeaders({
      authorization: 'Bearer shared-secret',
      cookie: `${env.AUTH_COOKIE_NAME}=shared-secret`,
    });

    expect(tokensFromRequest(request)).toEqual(['shared-secret']);
  });
});

describe('active organization resolution', () => {
  const memberships = [{ organizationId: 'organization-a' }, { organizationId: 'organization-b' }];

  it('does not fall back when a previously selected organization is unusable', () => {
    expect(resolveActiveMembership(memberships, 'expired-organization')).toBeNull();
  });

  it('requires explicit selection for a null context', () => {
    expect(resolveActiveMembership(memberships, null)).toBeNull();
  });
});
