import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';

vi.mock('../src/config/env.js', () => ({
  env: {
    REPORT_EMAIL_PROVIDER: 'webhook',
    REPORT_EMAIL_API_KEY: '',
    REPORT_EMAIL_FROM: '',
    REPORT_EMAIL_WEBHOOK_URL: 'https://reports.example.test/deliver',
    REPORT_EMAIL_WEBHOOK_TOKEN: 'report-token',
    REPORT_TELEGRAM_BOT_TOKEN: 'telegram-token',
    SUGGESTION_WEBHOOK_URL: 'https://feedback.example.test/suggestions',
    SUGGESTION_WEBHOOK_TOKEN: 'feedback-token',
  },
}));

import {
  processReportDeliveryJob,
  reportDeliveryIdempotencyKey,
} from '../src/modules/reports/report-delivery.service.js';
import { scheduleDueReports } from '../src/modules/reports/report-scheduler.service.js';
import {
  processSuggestionDeliveryJob,
  suggestionDeliveryEventId,
} from '../src/modules/feedback/feedback.service.js';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('P27 delivery idempotency', () => {
  it('builds a stable opaque report idempotency key', () => {
    const base = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      reportId: '22222222-2222-4222-8222-222222222222',
      delivery: {
        scheduleId: 'weekly-owner',
        channel: 'email' as const,
        destination: 'owner@example.test',
        slot: '2026-08-26T13:00',
      },
    };

    const first = reportDeliveryIdempotencyKey(base);
    const second = reportDeliveryIdempotencyKey(base);
    const different = reportDeliveryIdempotencyKey({
      ...base,
      delivery: { ...base.delivery, slot: '2026-09-02T13:00' },
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^bs-report-[a-f0-9]{64}$/);
    expect(different).not.toBe(first);
  });

  it('does not retry an already successful report solely because final audit persistence failed', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    const auditCreate = vi.fn()
      .mockResolvedValueOnce({ id: 'attempt-audit' })
      .mockRejectedValueOnce(new Error('AUDIT_STORAGE_UNAVAILABLE'));

    const prisma = {
      report: {
        findFirst: vi.fn().mockResolvedValue({
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Weekly reputation',
          periodStart: new Date('2026-08-19T12:00:00.000Z'),
          periodEnd: new Date('2026-08-26T12:00:00.000Z'),
          status: 'READY',
          generatedAt: new Date('2026-08-26T12:01:00.000Z'),
          data: { reviewCount: 10, averageRating: 4.6 },
        }),
      },
      auditLog: { create: auditCreate },
    } as unknown as PrismaClient;

    const input = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      reportId: '22222222-2222-4222-8222-222222222222',
      delivery: {
        scheduleId: 'weekly-owner',
        channel: 'email' as const,
        destination: 'owner@example.test',
        slot: '2026-08-26T13:00',
      },
    };

    await expect(processReportDeliveryJob(prisma, input)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(2);

    const [, request] = fetchMock.mock.calls[0]!;
    const headers = request?.headers as Record<string, string>;
    const expectedEventId = reportDeliveryIdempotencyKey(input);
    expect(headers['Idempotency-Key']).toBe(expectedEventId);
    expect(headers['X-Business-Shield-Event-Id']).toBe(expectedEventId);
    expect(JSON.parse(String(request?.body))).toMatchObject({ eventId: expectedEventId, to: 'owner@example.test' });
  });

  it('treats an already delivered product suggestion as a no-op', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const update = vi.fn();
    const prisma = {
      productSuggestion: {
        findUnique: vi.fn().mockResolvedValue({
          id: '33333333-3333-4333-8333-333333333333',
          deliveryStatus: 'DELIVERED',
        }),
        update,
      },
    } as unknown as PrismaClient;

    await expect(processSuggestionDeliveryJob(prisma, {
      suggestionId: '33333333-3333-4333-8333-333333333333',
    })).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('sends feedback webhooks with a stable receiver-dedupe event id', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const update = vi.fn().mockResolvedValue({});
    const suggestionId = '33333333-3333-4333-8333-333333333333';
    const prisma = {
      productSuggestion: {
        findUnique: vi.fn().mockResolvedValue({
          id: suggestionId,
          organizationId: '11111111-1111-4111-8111-111111111111',
          category: 'product',
          subject: 'Idea',
          message: 'Please add this',
          contactName: 'Owner',
          contactEmail: 'owner@example.test',
          createdAt: new Date('2026-08-26T12:00:00.000Z'),
          deliveryStatus: 'QUEUED',
        }),
        update,
      },
    } as unknown as PrismaClient;

    await processSuggestionDeliveryJob(prisma, { suggestionId });

    const [, request] = fetchMock.mock.calls[0]!;
    const headers = request?.headers as Record<string, string>;
    const eventId = suggestionDeliveryEventId(suggestionId);
    expect(headers['Idempotency-Key']).toBe(eventId);
    expect(headers['X-Business-Shield-Event-Id']).toBe(eventId);
    expect(JSON.parse(String(request?.body))).toMatchObject({ eventId, id: suggestionId });
    expect(update).toHaveBeenCalledWith({
      where: { id: suggestionId },
      data: { deliveryStatus: 'DELIVERED', deliveredAt: expect.any(Date), lastError: null },
    });
  });
});

describe('P27 report scheduler tenant isolation', () => {
  it('skips an invalid tenant timezone without blocking another due organization', async () => {
    const invalidOrganizationId = '11111111-1111-4111-8111-111111111111';
    const validOrganizationId = '22222222-2222-4222-8222-222222222222';
    const now = new Date('2026-08-26T12:00:00.000Z');
    const schedule = {
      id: 'weekly-owner',
      title: 'Weekly reputation',
      day: 'wed',
      time: '13:00',
      channel: 'email',
      enabled: true,
      destination: 'owner@example.test',
    };

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
      serviceMetadata: {
        findMany: vi.fn().mockResolvedValue([
          { key: `reports:schedules:${invalidOrganizationId}`, value: [schedule] },
          { key: `reports:schedules:${validOrganizationId}`, value: [schedule] },
        ]),
      },
      organization: {
        findMany: vi.fn().mockResolvedValue([
          { id: invalidOrganizationId, timezone: 'Invalid/Timezone' },
          { id: validOrganizationId, timezone: 'Europe/Stockholm' },
        ]),
      },
      job: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<boolean>) => callback(tx)),
    } as unknown as PrismaClient;

    const result = await scheduleDueReports(prisma, { now });

    expect(result).toEqual({ scheduled: 1, skipped: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: validOrganizationId, status: 'QUEUED' }),
    });
  });
});
