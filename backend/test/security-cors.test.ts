import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';
import { registerSecurity } from '../src/core/plugins/security.js';

const apps = [] as ReturnType<typeof Fastify>[];

async function buildSecurityApp() {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerSecurity(app);
  app.put('/resource', async () => ({ ok: true }));
  app.patch('/resource', async () => ({ ok: true }));
  app.delete('/resource', async () => ({ ok: true }));
  await app.ready();
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('browser mutation CORS boundary', () => {
  it.each(['PUT', 'PATCH', 'DELETE'])('allows %s preflight from an approved origin', async (method) => {
    const app = await buildSecurityApp();
    const origin = env.CORS_ORIGINS[0] ?? 'http://localhost:3000';

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/resource',
      headers: {
        origin,
        'access-control-request-method': method,
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');

    const allowedMethods = String(response.headers['access-control-allow-methods'] ?? '')
      .split(',')
      .map((value) => value.trim());
    expect(allowedMethods).toContain(method);
  });

  it('does not approve mutation preflight from an unknown origin', async () => {
    const app = await buildSecurityApp();

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/resource',
      headers: {
        origin: 'https://not-allowed.invalid',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
