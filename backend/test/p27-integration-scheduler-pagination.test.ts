import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { scheduleDueIntegrationSyncs } from '../src/modules/integrations/integration-scheduler.service.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter } from '../src/modules/integrations/providers/provider.types.js';

const PROVIDER_ID = 'pagination-provider';

const adapter: ProviderAdapter = {
  id: PROVIDER_ID,
  displayName: 'Pagination provider',
  capabilities: ['reviews.read'],
  availability: () => ({ configured: true, connectable: true }),
  connect: async () => ({ verified: true, health: 'CONNECTED' }),
  syncReviews: async () => ({ reviews: [], hasMore: false }),
};

afterEach(() => {
  providerRegistry.unregister(PROVIDER_ID);
});

describe('P27 integration scheduler pagination', () => {
  it('continues after a full account page instead of truncating scheduled syncs', async () => {
    providerRegistry.register(adapter);
    const now = new Date('2026-08-26T12:00:00.000Z');
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      organizationId: '11111111-1111-4111-8111-111111111111',
      provider: `unsupported-${index}`,
      configuration: { syncEnabled: true, syncIntervalMinutes: 30 },
      lastSyncedAt: null,
    }));
    const validAccount = {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      organizationId: '22222222-2222-4222-8222-222222222222',
      provider: PROVIDER_ID,
      configuration: { syncEnabled: true, syncIntervalMinutes: 30 },
      lastSyncedAt: new Date(now.getTime() - 60 * 60_000),
    };

    const findMany = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([validAccount]);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      integrationAccount: {
        findFirst: vi.fn().mockResolvedValue({ ...validAccount, status: 'CONNECTED' }),
      },
      integrationSyncRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' }),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'job-1' }),
      },
      integrationEvent: {
        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const prisma = {
      integrationAccount: { findMany },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<boolean>) => callback(tx)),
    } as unknown as PrismaClient;

    const result = await scheduleDueIntegrationSyncs(prisma, {
      now,
      defaultIntervalMinutes: 30,
    });

    expect(result).toEqual({ scheduled: 1, skipped: 500 });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      orderBy: { id: 'asc' },
      take: 500,
    }));
    expect(findMany.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      orderBy: { id: 'asc' },
      take: 500,
      cursor: { id: firstPage[499]!.id },
      skip: 1,
    }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.integrationSyncRun.create).toHaveBeenCalledWith({
      data: {
        organizationId: validAccount.organizationId,
        accountId: validAccount.id,
        status: 'QUEUED',
        trigger: 'schedule',
      },
    });
  });
});
