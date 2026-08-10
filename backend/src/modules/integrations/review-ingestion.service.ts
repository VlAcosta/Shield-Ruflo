import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { providerRegistry } from './providers/provider.registry.js';
import { ProviderAdapterError } from './providers/provider.errors.js';
import { loadIntegrationCredentialsFromPrisma } from './providers/credential-vault.js';
import type { ProviderConnectionContext, ProviderReviewRecord } from './providers/provider.types.js';

const MAX_SYNC_PAGES = 10_000;
const MAX_EXTERNAL_ID_LENGTH = 240;

type SyncCounters = {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
};

type SyncError = {
  code: string;
  message: string;
  retryable: boolean;
};

type IngestionDisposition = 'imported' | 'updated' | 'skipped';

type IntegrationAccountForSync = {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  externalAccountId: string | null;
  status: string;
  configuration: unknown;
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function validDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function normalizeText(value: string | undefined): string {
  return String(value ?? '').slice(0, 100_000);
}

function normalizeOptionalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function reviewRecordError(record: ProviderReviewRecord): string | null {
  if (!record.externalId || record.externalId.length > MAX_EXTERNAL_ID_LENGTH) return 'PROVIDER_REVIEW_EXTERNAL_ID_INVALID';
  if (!Number.isInteger(record.rating) || record.rating < 1 || record.rating > 5) return 'PROVIDER_REVIEW_RATING_INVALID';
  if (!validDate(record.publishedAt)) return 'PROVIDER_REVIEW_PUBLISHED_AT_INVALID';
  if (record.providerUpdatedAt !== undefined && !validDate(record.providerUpdatedAt)) return 'PROVIDER_REVIEW_UPDATED_AT_INVALID';
  if (record.providerLocationId && record.providerLocationId.length > MAX_EXTERNAL_ID_LENGTH) return 'PROVIDER_REVIEW_LOCATION_ID_INVALID';
  return null;
}

function safeSyncError(error: unknown): SyncError {
  if (error instanceof ProviderAdapterError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return {
    code: 'PROVIDER_SYNC_FAILED',
    message: 'Не удалось синхронизировать отзывы внешнего провайдера',
    retryable: true,
  };
}

function sourceExternalId(account: IntegrationAccountForSync, record: ProviderReviewRecord): string {
  return record.providerLocationId || account.externalAccountId || `integration:${account.id}`;
}

function sourceDisplayName(account: IntegrationAccountForSync, record: ProviderReviewRecord): string {
  return record.providerLocationName
    ? `${account.name} · ${record.providerLocationName}`.slice(0, 180)
    : account.name.slice(0, 180);
}

function metadataSyncMarker(value: unknown): { runId?: string; disposition?: IngestionDisposition } {
  const metadata = jsonObject(value);
  const sync = jsonObject(metadata.providerSync);
  const disposition = sync.disposition;
  return {
    runId: typeof sync.runId === 'string' ? sync.runId : undefined,
    disposition: ['imported', 'updated', 'skipped'].includes(String(disposition))
      ? disposition as IngestionDisposition
      : undefined,
  };
}

function providerMetadata(
  existing: unknown,
  account: IntegrationAccountForSync,
  syncRunId: string,
  disposition: IngestionDisposition,
  record: ProviderReviewRecord,
): Prisma.InputJsonValue {
  return asJson({
    ...jsonObject(existing),
    provider: {
      id: account.provider,
      integrationAccountId: account.id,
      externalLocationId: record.providerLocationId ?? null,
      externalLocationName: record.providerLocationName ?? null,
      raw: record.raw ?? {},
    },
    providerSync: {
      runId: syncRunId,
      disposition,
      syncedAt: new Date().toISOString(),
    },
  });
}

async function primaryBusiness(prisma: PrismaClient, organizationId: string) {
  const business = await prisma.business.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  if (!business) {
    throw new AppError({
      code: 'SYNC_ACTIVE_BUSINESS_REQUIRED',
      message: 'Для импорта отзывов сначала создайте активный бизнес в организации.',
      statusCode: 409,
    });
  }
  return business;
}

async function resolveInternalLocation(
  prisma: PrismaClient,
  businessId: string,
  selectedProviderLocationCount: number,
  record: ProviderReviewRecord,
): Promise<string | null> {
  const locations = await prisma.location.findMany({
    where: { businessId, status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  if (!locations.length) return null;
  if (locations.length === 1 && selectedProviderLocationCount === 1) return locations[0]!.id;
  const providerName = record.providerLocationName?.trim().toLocaleLowerCase('ru-RU');
  if (!providerName) return null;
  const matches = locations.filter((location) => location.name.trim().toLocaleLowerCase('ru-RU') === providerName);
  return matches.length === 1 ? matches[0]!.id : null;
}

async function ensureSource(
  prisma: PrismaClient,
  account: IntegrationAccountForSync,
  businessId: string,
  selectedProviderLocationCount: number,
  record: ProviderReviewRecord,
) {
  const externalAccountId = sourceExternalId(account, record);
  let source = await prisma.reviewSource.findFirst({
    where: {
      organizationId: account.organizationId,
      provider: account.provider,
      externalAccountId,
    },
  });
  const locationId = await resolveInternalLocation(prisma, businessId, selectedProviderLocationCount, record);
  const nextMetadata = asJson({
    ...jsonObject(source?.metadata),
    integrationAccountId: account.id,
    providerAccountId: account.externalAccountId,
    providerLocationId: record.providerLocationId ?? null,
    providerLocationName: record.providerLocationName ?? null,
  });

  if (!source) {
    source = await prisma.reviewSource.create({
      data: {
        organizationId: account.organizationId,
        businessId,
        locationId,
        provider: account.provider,
        name: sourceDisplayName(account, record),
        externalAccountId,
        status: 'ACTIVE',
        metadata: nextMetadata,
      },
    });
    return source;
  }

  if (
    source.businessId !== businessId
    || source.locationId !== locationId
    || source.name !== sourceDisplayName(account, record)
  ) {
    source = await prisma.reviewSource.update({
      where: { id: source.id },
      data: {
        businessId,
        locationId,
        name: sourceDisplayName(account, record),
        metadata: nextMetadata,
      },
    });
  }
  return source;
}

async function ingestReviewRecord(
  prisma: PrismaClient,
  account: IntegrationAccountForSync,
  syncRunId: string,
  businessId: string,
  selectedProviderLocationCount: number,
  record: ProviderReviewRecord,
): Promise<{ disposition: IngestionDisposition; sourceId: string }> {
  const source = await ensureSource(prisma, account, businessId, selectedProviderLocationCount, record);
  const existing = await prisma.review.findUnique({
    where: { sourceId_externalId: { sourceId: source.id, externalId: record.externalId } },
    select: {
      id: true,
      authorId: true,
      rating: true,
      text: true,
      sourceUrl: true,
      publishedAt: true,
      providerUpdatedAt: true,
      metadata: true,
    },
  });

  const previousMarker = metadataSyncMarker(existing?.metadata);
  if (previousMarker.runId === syncRunId && previousMarker.disposition) {
    return { disposition: previousMarker.disposition, sourceId: source.id };
  }

  const authorExternalId = (record.authorExternalId || `provider-review:${record.externalId}:author`).slice(0, MAX_EXTERNAL_ID_LENGTH);
  const authorName = (record.authorName || 'Гость').slice(0, 180);
  const providerUpdatedAt = record.providerUpdatedAt ?? record.publishedAt;
  const sourceUrl = normalizeOptionalUrl(record.sourceUrl);
  const nextText = normalizeText(record.text);

  let disposition: IngestionDisposition = 'imported';
  if (existing) {
    const changed = existing.rating !== record.rating
      || existing.text !== nextText
      || existing.sourceUrl !== sourceUrl
      || existing.publishedAt?.getTime() !== record.publishedAt.getTime()
      || existing.providerUpdatedAt?.getTime() !== providerUpdatedAt.getTime();
    disposition = changed ? 'updated' : 'skipped';
  }

  await prisma.$transaction(async (tx) => {
    const author = await tx.reviewAuthor.upsert({
      where: { sourceId_externalId: { sourceId: source.id, externalId: authorExternalId } },
      create: {
        organizationId: account.organizationId,
        sourceId: source.id,
        externalId: authorExternalId,
        name: authorName,
        avatarUrl: normalizeOptionalUrl(record.authorAvatarUrl),
        profileUrl: normalizeOptionalUrl(record.authorProfileUrl),
      },
      update: {
        name: authorName,
        avatarUrl: normalizeOptionalUrl(record.authorAvatarUrl),
        profileUrl: normalizeOptionalUrl(record.authorProfileUrl),
      },
    });

    if (!existing) {
      await tx.review.create({
        data: {
          organizationId: account.organizationId,
          businessId,
          locationId: source.locationId,
          sourceId: source.id,
          authorId: author.id,
          externalId: record.externalId,
          rating: record.rating,
          text: nextText,
          sourceUrl,
          publishedAt: record.publishedAt,
          providerUpdatedAt,
          receivedAt: new Date(),
          metadata: providerMetadata(null, account, syncRunId, disposition, record),
        },
      });
      return;
    }

    await tx.review.update({
      where: { id: existing.id },
      data: {
        businessId,
        locationId: source.locationId,
        authorId: author.id,
        rating: record.rating,
        text: nextText,
        sourceUrl,
        publishedAt: record.publishedAt,
        providerUpdatedAt,
        metadata: providerMetadata(existing.metadata, account, syncRunId, disposition, record),
      },
    });
  });

  return { disposition, sourceId: source.id };
}

function selectedProviderLocationCount(configuration: unknown): number {
  const value = jsonObject(configuration).googleSelectedLocationNames;
  return Array.isArray(value) ? value.length : 0;
}

async function finishFailedSync(
  prisma: PrismaClient,
  runId: string,
  account: IntegrationAccountForSync,
  error: SyncError,
) {
  const now = new Date();
  await prisma.$transaction([
    prisma.integrationSyncRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        finishedAt: now,
        errorCount: { increment: 1 },
        errorCode: error.code,
        errorMessage: error.message,
      },
    }),
    prisma.integrationAccount.update({
      where: { id: account.id },
      data: {
        status: error.retryable ? 'DEGRADED' : 'ERROR',
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
      },
    }),
    prisma.integrationEvent.create({
      data: {
        organizationId: account.organizationId,
        accountId: account.id,
        type: 'sync.failed',
        payload: { code: error.code, retryable: error.retryable },
      },
    }),
  ]);
}

export async function processIntegrationReviewSync(
  prisma: PrismaClient,
  input: { syncRunId: string; accountId: string },
): Promise<SyncCounters> {
  const run = await prisma.integrationSyncRun.findFirst({
    where: { id: input.syncRunId, accountId: input.accountId },
  });
  if (!run) throw new Error('INTEGRATION_SYNC_RUN_NOT_FOUND');

  const account = await prisma.integrationAccount.findFirst({
    where: { id: input.accountId, organizationId: run.organizationId },
  });
  if (!account) throw new Error('INTEGRATION_ACCOUNT_NOT_FOUND');

  const syncAccount: IntegrationAccountForSync = account;
  const adapter = providerRegistry.get(account.provider);
  const availability = adapter?.availability();
  if (!['CONNECTED', 'DEGRADED'].includes(account.status)) {
    const error = { code: 'INTEGRATION_NOT_CONNECTED', message: 'Интеграция не подключена к production provider adapter', retryable: false };
    await finishFailedSync(prisma, run.id, syncAccount, error);
    throw new AppError({ code: error.code, message: error.message, statusCode: 409 });
  }
  if (!adapter || !availability?.configured || !availability.connectable || !adapter.capabilities.includes('reviews.read') || !adapter.syncReviews) {
    const error = {
      code: availability?.reasonCode || 'PROVIDER_REVIEW_SYNC_NOT_CONFIGURED',
      message: availability?.reasonMessage || 'Production provider adapter не поддерживает импорт отзывов',
      retryable: false,
    };
    await finishFailedSync(prisma, run.id, syncAccount, error);
    throw new AppError({ code: error.code, message: error.message, statusCode: 422 });
  }

  const business = await primaryBusiness(prisma, account.organizationId);
  const context: ProviderConnectionContext = {
    organizationId: account.organizationId,
    accountId: account.id,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    configuration: jsonObject(account.configuration),
    credentials: await loadIntegrationCredentialsFromPrisma(prisma, account.organizationId, account.id),
  };

  await prisma.$transaction([
    prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        startedAt: run.startedAt ?? new Date(),
        finishedAt: null,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        errorCode: null,
        errorMessage: null,
      },
    }),
    prisma.integrationEvent.create({
      data: { organizationId: account.organizationId, accountId: account.id, type: 'sync.started', payload: { syncRunId: run.id } },
    }),
  ]);

  const counters: SyncCounters = { imported: 0, updated: 0, skipped: 0, errors: 0 };
  const touchedSourceIds = new Set<string>();
  const seenReviews = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;

  try {
    do {
      if (pages >= MAX_SYNC_PAGES) {
        throw new ProviderAdapterError({
          code: 'PROVIDER_SYNC_PAGE_LIMIT_EXCEEDED',
          message: 'Синхронизация остановлена: провайдер вернул слишком много страниц.',
          statusCode: 502,
          retryable: false,
        });
      }
      if (cursor && seenCursors.has(cursor)) {
        throw new ProviderAdapterError({
          code: 'PROVIDER_SYNC_CURSOR_LOOP',
          message: 'Синхронизация остановлена: провайдер повторил cursor.',
          statusCode: 502,
          retryable: false,
        });
      }
      if (cursor) seenCursors.add(cursor);
      pages += 1;

      const page = await adapter.syncReviews(context, cursor);
      for (const record of page.reviews) {
        const recordError = reviewRecordError(record);
        if (recordError) {
          counters.errors += 1;
          continue;
        }

        const identity = `${record.providerLocationId || account.externalAccountId || account.id}:${record.externalId}`;
        if (seenReviews.has(identity)) continue;
        seenReviews.add(identity);

        try {
          const result = await ingestReviewRecord(
            prisma,
            syncAccount,
            run.id,
            business.id,
            selectedProviderLocationCount(account.configuration),
            record,
          );
          touchedSourceIds.add(result.sourceId);
          if (result.disposition === 'imported') counters.imported += 1;
          else if (result.disposition === 'updated') counters.updated += 1;
          else counters.skipped += 1;
        } catch {
          counters.errors += 1;
        }
      }

      const nextCursor = page.nextCursor;
      if (page.hasMore && !nextCursor) {
        throw new ProviderAdapterError({
          code: 'PROVIDER_SYNC_CURSOR_MISSING',
          message: 'Провайдер сообщил о следующей странице без cursor.',
          statusCode: 502,
          retryable: false,
        });
      }
      cursor = page.hasMore ? nextCursor : undefined;
    } while (cursor);

    const now = new Date();
    const status = counters.errors > 0 ? 'PARTIAL' : 'SUCCESS';
    await prisma.$transaction([
      prisma.integrationSyncRun.update({
        where: { id: run.id },
        data: {
          status,
          importedCount: counters.imported,
          updatedCount: counters.updated,
          skippedCount: counters.skipped,
          errorCount: counters.errors,
          errorCode: counters.errors ? 'PROVIDER_RECORDS_PARTIAL' : null,
          errorMessage: counters.errors ? 'Часть записей провайдера была пропущена из-за некорректных данных.' : null,
          finishedAt: now,
        },
      }),
      prisma.integrationAccount.update({
        where: { id: account.id },
        data: {
          status: counters.errors ? 'DEGRADED' : 'CONNECTED',
          lastSyncedAt: now,
          lastErrorCode: counters.errors ? 'PROVIDER_RECORDS_PARTIAL' : null,
          lastErrorMessage: counters.errors ? 'Часть отзывов провайдера не удалось импортировать.' : null,
        },
      }),
      prisma.integrationEvent.create({
        data: {
          organizationId: account.organizationId,
          accountId: account.id,
          type: counters.errors ? 'sync.partial' : 'sync.succeeded',
          payload: { syncRunId: run.id, ...counters, pages },
        },
      }),
    ]);
    if (touchedSourceIds.size) {
      await prisma.reviewSource.updateMany({ where: { id: { in: [...touchedSourceIds] } }, data: { lastSyncedAt: now } });
    }
    return counters;
  } catch (error) {
    const syncError = safeSyncError(error);
    await finishFailedSync(prisma, run.id, syncAccount, syncError);
    throw error instanceof Error ? error : new Error(syncError.code);
  }
}
