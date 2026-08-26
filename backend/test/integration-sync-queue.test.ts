import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { queueIntegrationSync } from '../src/modules/integrations/integrations.service.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter } from '../src/modules/integrations/providers/provider.types.js';

const PROVIDER_ID = 'manual-retry-test';

const adapter: ProviderAdapter = {
  id: PROVIDER_ID,
  displayName: 'Manual retry test provider',
  capabilities: ['reviews.read'],
  availability: () => ({ configured: true, connectable: true }),
  connect: async () => ({ verified: true, health: 'CONNECTED' }),
  syncReviews: async () => ({ reviews: [], hasMore: false }),
};

afterEach(() => {
  providerRegistry.unregister(PROVIDER_ID);
});

describe('manual integration sync retry dedupe', () => {
  it('returns the existing run instead of creating a duplicate while its durable job is active', async () => {
    providerRegistry.register(adapter);

    const account = {
      id: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      provider: PROVIDER_ID,
      status: 'DEGRADED',
    };
    const retryingRun = {
      id: '33333333-3333-4333-8333-333333333333',
      organizationId: account.organizationId,
      accountId: account.id,
      status: 'FAILED',
      trigger: 'schedule',
    };

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      integrationAccount: {
        findFirst: vi.fn().mockResolvedValue(account),
      },
      integrationSyncRun: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(retryingRun),
        create: vi.fn(),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue({ id: 'retry-job' }),
        create: vi.fn(),
      },
    };

    const app = {
      prisma: {
        integrationAccount: {
          findFirst: vi.fn().mockResolvedValue(account),
        },
        $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      },
    } as unknown as FastifyInstance;

    const result = await queueIntegrationSync(app, account.organizationId, account.id, 'manual');

    expect(result).toBe(retryingRun);
    expect(tx.job.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: account.organizationId,
        type: 'integration.sync.reviews',
        status: { in: ['QUEUED', 'RUNNING'] },
        dedupeKey: { startsWith: `integration-sync:${account.id}:` },
      },
      select: { id: true },
    });
    expect(tx.integrationSyncRun.create).not.toHaveBeenCalled();
    expect(tx.job.create).not.toHaveBeenCalled();
  });
});
