import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_BUSINESS_SCOPE,
  GoogleBusinessProfileClient,
} from '../src/modules/integrations/providers/google/google-business-profile.client.js';
import {
  createGoogleOAuthState,
  verifyGoogleOAuthState,
} from '../src/modules/integrations/providers/google/google-oauth-state.js';

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function client(fetcher: typeof fetch) {
  return new GoogleBusinessProfileClient({
    clientId: 'google-client-id.apps.googleusercontent.com',
    clientSecret: 'google-client-secret-never-public',
    redirectUri: 'https://bis-shield.ru/api/v1/integrations/providers/google-business-profile/oauth/callback',
    timeoutMs: 5_000,
    fetcher,
  });
}

describe('P16 Google Business Profile OAuth state', () => {
  it('binds signed state to tenant user and account and rejects tampering and expiry', () => {
    const now = Date.parse('2026-08-10T20:00:00.000Z');
    const created = createGoogleOAuthState({
      organizationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      accountId: '33333333-3333-4333-8333-333333333333',
      now,
    });

    expect(created.nonceHash).toMatch(/^[a-f0-9]{64}$/);
    const verified = verifyGoogleOAuthState(created.state, now + 1_000);
    expect(verified).toMatchObject({
      provider: 'google-business-profile',
      organizationId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      accountId: '33333333-3333-4333-8333-333333333333',
    });

    const tampered = `${created.state.slice(0, -1)}${created.state.endsWith('A') ? 'B' : 'A'}`;
    expect(() => verifyGoogleOAuthState(tampered, now + 1_000)).toThrow('Проверка Google OAuth state не пройдена');
    expect(() => verifyGoogleOAuthState(created.state, now + 11 * 60_000)).toThrow('Google OAuth state истёк');
  });
});

describe('P16 Google Business Profile transport', () => {
  it('builds the official OAuth authorization URL without exposing the client secret', () => {
    const url = new URL(client(vi.fn() as unknown as typeof fetch).authorizationUrl('signed-state-value'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('google-client-id.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://bis-shield.ru/api/v1/integrations/providers/google-business-profile/oauth/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_BUSINESS_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('signed-state-value');
    expect(url.toString()).not.toContain('google-client-secret-never-public');
  });

  it('exchanges the authorization code through the token endpoint and parses refresh credentials', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://oauth2.googleapis.com/token');
      expect(init?.method).toBe('POST');
      const body = init?.body as URLSearchParams;
      expect(body.get('code')).toBe('authorization-code');
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('client_secret')).toBe('google-client-secret-never-public');
      return jsonResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        scope: GOOGLE_BUSINESS_SCOPE,
        token_type: 'Bearer',
      });
    }) as unknown as typeof fetch;

    await expect(client(fetcher).exchangeAuthorizationCode('authorization-code')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      scope: GOOGLE_BUSINESS_SCOPE,
      tokenType: 'Bearer',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('paginates accounts and locations with bearer auth and the required Business Information read mask', async () => {
    const requests: Array<{ url: URL; authorization: string | null }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get('authorization') });

      if (url.hostname === 'mybusinessaccountmanagement.googleapis.com') {
        if (!url.searchParams.get('pageToken')) {
          return jsonResponse({ accounts: [{ name: 'accounts/123', accountName: 'Alpha' }], nextPageToken: 'next-account' });
        }
        return jsonResponse({ accounts: [{ name: 'accounts/456', accountName: 'Beta' }] });
      }

      if (url.hostname === 'mybusinessbusinessinformation.googleapis.com') {
        if (!url.searchParams.get('pageToken')) {
          return jsonResponse({ locations: [{ name: 'locations/one', title: 'Location One' }], nextPageToken: 'next-location' });
        }
        return jsonResponse({ locations: [{ name: 'locations/two', title: 'Location Two' }] });
      }

      throw new Error(`Unexpected request: ${url.toString()}`);
    }) as unknown as typeof fetch;

    const google = client(fetcher);
    await expect(google.listAccounts('access-token')).resolves.toHaveLength(2);
    await expect(google.listLocations('access-token', 'accounts/123')).resolves.toHaveLength(2);

    expect(requests).toHaveLength(4);
    expect(requests.every((request) => request.authorization === 'Bearer access-token')).toBe(true);
    const locationRequests = requests.filter((request) => request.url.hostname === 'mybusinessbusinessinformation.googleapis.com');
    expect(locationRequests[0]?.url.pathname).toBe('/v1/accounts/123/locations');
    expect(locationRequests[0]?.url.searchParams.get('pageSize')).toBe('100');
    expect(locationRequests[0]?.url.searchParams.get('readMask')).toBe(
      'name,title,storeCode,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,openInfo,metadata',
    );
  });

  it('maps Google authorization failures to sanitized provider errors', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      error: { message: 'token=do-not-leak-upstream-secret' },
    }, { status: 403 })) as unknown as typeof fetch;

    await expect(client(fetcher).listAccounts('access-token')).rejects.toMatchObject({
      code: 'GOOGLE_BUSINESS_ACCESS_DENIED',
      statusCode: 403,
      retryable: false,
    });
    try {
      await client(fetcher).listAccounts('access-token');
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('do-not-leak-upstream-secret');
      expect(String((error as Error).message)).not.toContain('access-token');
    }
  });
});
