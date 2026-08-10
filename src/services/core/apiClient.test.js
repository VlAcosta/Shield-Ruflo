import { apiRequest, AUTH_SESSION_INVALID_EVENT, joinEndpoint } from './apiClient';

describe('joinEndpoint', () => {
  test('appends query strings without creating a trailing path segment', () => {
    expect(joinEndpoint('/api/v1/reviews', '?page=1&pageSize=30'))
      .toBe('/api/v1/reviews?page=1&pageSize=30');
  });
});

describe('authentication failures', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('announces a 401 so the application can leave an expired session', async () => {
    const onInvalidSession = jest.fn();
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, onInvalidSession);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'UNAUTHENTICATED', message: 'Session expired' },
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(apiRequest('/api/v1/me', { retries: 0 })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(onInvalidSession).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTH_SESSION_INVALID_EVENT, onInvalidSession);
  });

  test('does not invalidate the session for a permission denial', async () => {
    const onInvalidSession = jest.fn();
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, onInvalidSession);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'FORBIDDEN', message: 'Permission denied' },
    }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(apiRequest('/api/v1/reviews', { retries: 0 })).rejects.toMatchObject({ status: 403 });
    expect(onInvalidSession).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_SESSION_INVALID_EVENT, onInvalidSession);
  });
});
