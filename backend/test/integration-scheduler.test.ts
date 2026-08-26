import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { scheduleDueIntegrationSyncs } from '../src/modules/integrations/integration-scheduler.service.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter } from '../src/modules/integrations/providers/provider.types.js';

const PROVIDER_ID = 'scheduler-retry-test';

const adapter: ProviderAdapter = {
  id: PROVIDER_ID,
  displayName: 'Scheduler retry test provider',
  capabilities: ['reviews.read'],
  availability: () => ({ configured: true, connectable: true }),
  connect: async () => ({ verified: true, health: 'CONNECTED' }),
  syncReviews: async () => ({ reviews: [], hasMore: false }),
};

afterEach(() => {
  providerRegistry.unregister(PROVIDER_ID);
});

describe('integration sync scheduler retry dedupe', () => {
  it('does not create a second sync run while the durable retry job is still queued', async () => {
    providerRegistry.register(adapter);

    const now = new Date('2026-08-26T12:00:00.000Z');
    const account = {
      id: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      provider: PROVIDER_ID,
      status: 'DEGRADED',
      configuration: { syncEnabled: true, syncIntervalMinutes: 30 },
      lastSyncedAt: new Date(now.getTime() - 60 * 60_000),
    };

    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      integrationAccount: {
        findFirst: vi.fn().mockResolvedValue(account),
      },
      integrationSyncRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue({ id: 'retry-job' }),
        create: vi.fn(),
      },
      integrationEvent: {
        create: vi.fn(),
      },
    };

    const prisma = {
      integrationAccount: {
        findMany: vi.fn().mockResolvedValue([account]),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<boolean>) => callback(tx)),
    } as unknown as PrismaClient;

    const result = await scheduleDueIntegrationSyncs(prisma, {
      now,
      defaultIntervalMinutes: 30,
    });

    expect(result).toEqual({ scheduled: 0, skipped: 1 });
    expect(tx.job.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: account.organizationId,
        type: 'integration.sync.reviews',
        status: { in: ['QUEUED', 'RUNNING'] },
        payload: { path: ['accountId'], equals: account.id },
      },
      select: { id: true },
    });
    expect(tx.integrationSyncRun.create).not.toHaveBeenCalled();
    expect(tx.job.create).not.toHaveBeenCalled();
    expect(tx.integrationEvent.create).not.toHaveBeenCalled();
  });
});
