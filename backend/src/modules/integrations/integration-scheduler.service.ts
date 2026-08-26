import type { PrismaClient } from '../../generated/prisma/client.js';
import { providerRegistry } from './providers/provider.registry.js';

const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;

type Configuration = Record<string, unknown>;

function config(value: unknown): Configuration {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Configuration : {};
}

function intervalMinutes(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.round(numeric)));
}

function syncEnabled(value: unknown): boolean {
  return value !== false;
}

export function nextIntegrationSyncAt(
  lastSyncedAt: Date | null,
  configuration: unknown,
  defaultIntervalMinutes: number,
): Date | null {
  const settings = config(configuration);
  if (!syncEnabled(settings.syncEnabled)) return null;
  const interval = intervalMinutes(settings.syncIntervalMinutes, defaultIntervalMinutes);
  return new Date((lastSyncedAt?.getTime() ?? 0) + interval * 60_000);
}

export async function scheduleDueIntegrationSyncs(
  prisma: PrismaClient,
  input: { now?: Date; defaultIntervalMinutes: number },
): Promise<{ scheduled: number; skipped: number }> {
  const now = input.now ?? new Date();
  const accounts = await prisma.integrationAccount.findMany({
    where: { status: { in: ['CONNECTED', 'DEGRADED'] } },
    select: {
      id: true,
      organizationId: true,
      provider: true,
      status: true,
      configuration: true,
      lastSyncedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 2_000,
  });

  let scheduled = 0;
  let skipped = 0;
  for (const account of accounts) {
    const adapter = providerRegistry.get(account.provider);
    const availability = adapter?.availability();
    if (!adapter || !availability?.configured || !availability.connectable || !adapter.capabilities.includes('reviews.read') || !adapter.syncReviews) {
      skipped += 1;
      continue;
    }
    const settings = config(account.configuration);
    if (!syncEnabled(settings.syncEnabled)) {
      skipped += 1;
      continue;
    }
    const interval = intervalMinutes(settings.syncIntervalMinutes, input.defaultIntervalMinutes);
    const dueAt = nextIntegrationSyncAt(account.lastSyncedAt, settings, interval);
    if (dueAt && dueAt > now) {
      skipped += 1;
      continue;
    }

    const created = await prisma.$transaction(async (tx) => {
      const lockKey = `integration-sync:${account.id}`;
      await tx.$queryRaw<Array<{ acquired: number }>>`
        SELECT 1::int AS acquired FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)) AS advisory_lock
      `;
      const fresh = await tx.integrationAccount.findFirst({
        where: { id: account.id, organizationId: account.organizationId, status: { in: ['CONNECTED', 'DEGRADED'] } },
      });
      if (!fresh) return false;
      const freshSettings = config(fresh.configuration);
      if (!syncEnabled(freshSettings.syncEnabled)) return false;
      const freshInterval = intervalMinutes(freshSettings.syncIntervalMinutes, input.defaultIntervalMinutes);
      const freshDueAt = nextIntegrationSyncAt(fresh.lastSyncedAt, freshSettings, freshInterval);
      if (freshDueAt && freshDueAt > now) return false;

      const active = await tx.integrationSyncRun.findFirst({
        where: { accountId: account.id, status: { in: ['QUEUED', 'RUNNING'] } },
        select: { id: true },
      });
      if (active) return false;

      // The durable queue is the authoritative dedupe boundary during retry
      // windows. Every review-sync job uses this account-scoped key prefix, so
      // this remains type-safe and queryable without inspecting JSON payloads.
      const activeJob = await tx.job.findFirst({
        where: {
          organizationId: account.organizationId,
          type: 'integration.sync.reviews',
          status: { in: ['QUEUED', 'RUNNING'] },
          dedupeKey: { startsWith: `integration-sync:${account.id}:` },
        },
        select: { id: true },
      });
      if (activeJob) return false;

      const run = await tx.integrationSyncRun.create({
        data: { organizationId: account.organizationId, accountId: account.id, status: 'QUEUED', trigger: 'schedule' },
      });
      await tx.job.create({
        data: {
          organizationId: account.organizationId,
          type: 'integration.sync.reviews',
          payload: { accountId: account.id, syncRunId: run.id, trigger: 'schedule' },
          dedupeKey: `integration-sync:${account.id}:${run.id}`,
          maxAttempts: 5,
        },
      });
      await tx.integrationEvent.create({
        data: {
          organizationId: account.organizationId,
          accountId: account.id,
          type: 'sync.scheduled',
          payload: { syncRunId: run.id, intervalMinutes: freshInterval },
        },
      });
      return true;
    });
    if (created) scheduled += 1;
    else skipped += 1;
  }

  return { scheduled, skipped };
}
