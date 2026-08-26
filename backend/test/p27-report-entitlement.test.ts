import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  hasReportsEntitlement,
  reportEntitledOrganizationIds,
} from '../src/modules/reports/report-entitlement.service.js';

describe('P27 background report entitlement', () => {
  it('allows an active subscription with reports=true', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const findMany = vi.fn().mockResolvedValue([{
      organizationId,
      status: 'ACTIVE',
      currentPeriodEnd: null,
      plan: { entitlements: [{ key: 'reports', value: true }] },
    }]);
    const prisma = { subscription: { findMany } } as unknown as PrismaClient;

    await expect(hasReportsEntitlement(prisma, organizationId)).resolves.toBe(true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: { in: [organizationId] } }),
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('rejects an expired trial even when its plan still contains reports=true', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const now = new Date('2026-08-26T12:00:00.000Z');
    const prisma = {
      subscription: {
        findMany: vi.fn().mockResolvedValue([{
          organizationId,
          status: 'TRIALING',
          currentPeriodEnd: new Date('2026-08-26T11:59:59.000Z'),
          plan: { entitlements: [{ key: 'reports', value: true }] },
        }]),
      },
    } as unknown as PrismaClient;

    await expect(hasReportsEntitlement(prisma, organizationId, now)).resolves.toBe(false);
  });

  it('uses only the newest active-like subscription for each organization', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const prisma = {
      subscription: {
        findMany: vi.fn().mockResolvedValue([
          {
            organizationId,
            status: 'ACTIVE',
            currentPeriodEnd: null,
            plan: { entitlements: [{ key: 'reports', value: false }] },
          },
          {
            organizationId,
            status: 'ACTIVE',
            currentPeriodEnd: null,
            plan: { entitlements: [{ key: 'reports', value: true }] },
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await reportEntitledOrganizationIds(prisma, [organizationId]);
    expect(result.has(organizationId)).toBe(false);
  });
});
