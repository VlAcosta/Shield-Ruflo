import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('health routes', () => {
  it('returns liveness without requiring a database query', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('returns API metadata', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/meta' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ apiVersion: 'v1' });
  });

  it('returns credential-free provider capability truth without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/meta/providers' });

    expect(response.statusCode).toBe(200);
    const providers = response.json().providers;
    expect(providers.find((item: any) => item.id === 'google-business-profile')).toMatchObject({
      capabilities: { reviewRead: true, reviewReply: true, reviewDelete: false },
      sync: { frequency: 'scheduled_and_on_demand' },
    });
    expect(providers.find((item: any) => item.id === 'yandex')).toMatchObject({
      releaseStage: 'PLANNED',
      configured: false,
      connectable: false,
      capabilities: { reviewRead: false, reviewReply: false },
    });
  });
});
