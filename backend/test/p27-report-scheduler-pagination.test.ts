import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { scheduleDueReports } from '../src/modules/reports/report-scheduler.service.js';

describe('P27 report scheduler pagination', () => {
  it('continues after a full metadata page instead of silently truncating tenants', async () => {
    const validOrganizationId = '22222222-2222-4222-8222-222222222222';
    const now = new Date('2026-08-26T12:00:00.000Z');
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      key: `reports:schedules:invalid-${String(index).padStart(4, '0')}`,
      value: [],
    }));
    const secondPage = [{
      key: `reports:schedules:${validOrganizationId}`,
      value: [{
        id: 'weekly-owner',
        title: 'Weekly reputation',
        day: 'wed',
        time: '13:00',
        channel: 'email',
        enabled: true,
        destination: 'owner@example.test',
      }],
    }];

    const findMetadata = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: 1 }]),
      job: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'job-1' }),
      },
      report: {
        create: vi.fn().mockResolvedValue({ id: 'report-1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };
    const prisma = {
      serviceMetadata: { findMany: findMetadata },
      organization: {
        findMany: vi.fn().mockResolvedValue([{ id: validOrganizationId, timezone: 'Europe/Stockholm' }]),
      },
      subscription: {
        findMany: vi.fn().mockResolvedValue([{
          organizationId: validOrganizationId,
          status: 'ACTIVE',
          currentPeriodEnd: null,
          plan: { entitlements: [{ key: 'reports', value: true }] },
        }]),
      },
      job: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<boolean>) => callback(tx)),
    } as unknown as PrismaClient;

    const result = await scheduleDueReports(prisma, { now });

    expect(result).toEqual({ scheduled: 1, skipped: 0 });
    expect(findMetadata).toHaveBeenCalledTimes(2);
    expect(findMetadata.mock.calls[0]?.[0]).toEqual({
      where: { key: { startsWith: 'reports:schedules:' } },
      orderBy: { key: 'asc' },
      take: 500,
    });
    expect(findMetadata.mock.calls[1]?.[0]).toEqual({
      where: { key: { startsWith: 'reports:schedules:' } },
      orderBy: { key: 'asc' },
      take: 500,
      cursor: { key: firstPage[499]!.key },
      skip: 1,
    });
    expect(tx.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: validOrganizationId, status: 'QUEUED' }),
    });
  });
});
