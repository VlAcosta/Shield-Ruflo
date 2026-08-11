import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { providerRegistry } from '../integrations/providers/provider.registry.js';
import { loadIntegrationCredentialsFromPrisma } from '../integrations/providers/credential-vault.js';
import { ProviderAdapterError } from '../integrations/providers/provider.errors.js';
import type { ProviderConnectionContext, ProviderLocationProfileRecord } from '../integrations/providers/provider.types.js';
import { LISTING_HEALTH_SCORE_VERSION } from './listing-health.schemas.js';

const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const FIELD_WEIGHTS = Object.freeze({ name: 15, address: 20, phone: 15, website: 10, regularHours: 15, categories: 15, images: 5, freshness: 5 });

type TenantActor = { organizationId: string; userId: string };
type CanonicalPatch = {
  name?: string;
  phone?: string | null;
  website?: string | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  regularHours?: Record<string, unknown> | null;
  categories?: string[] | null;
  attributes?: Record<string, unknown> | null;
  images?: string[] | null;
};

type HealthIssue = {
  type: 'MISSING' | 'MISMATCH' | 'STALE' | 'DUPLICATE' | 'UNMAPPED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  field: string;
  expected: Prisma.InputJsonValue | null;
  observed: Prisma.InputJsonValue | null;
  explanation: string;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function canonicalAddress(location: any): string | null {
  const parts = [location.countryCode, location.region, location.city, location.addressLine1, location.addressLine2, location.postalCode]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function canonicalProfile(location: any) {
  return {
    name: location.name,
    address: canonicalAddress(location),
    phone: location.phone ?? null,
    website: location.website ?? null,
    regularHours: location.regularHours ?? null,
    categories: Array.isArray(location.categories) ? location.categories : location.categories ?? null,
    attributes: location.attributes ?? null,
    images: Array.isArray(location.images) ? location.images : location.images ?? null,
  };
}

function comparableJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return JSON.stringify([...value].map((item) => normalizedText(item)).sort());
  if (typeof value === 'object') return JSON.stringify(value);
  return normalizedText(value);
}

function issue(input: HealthIssue): HealthIssue { return input; }

export function calculateLocationHealth(location: any, observed: ProviderLocationProfileRecord, now = new Date()) {
  const canonical = canonicalProfile(location);
  const provider = {
    name: observed.title ?? null,
    address: observed.address ?? null,
    phone: observed.phone ?? null,
    website: observed.website ?? null,
    regularHours: observed.regularHours ?? null,
    categories: observed.categories ?? null,
    attributes: observed.attributes ?? null,
    images: observed.images ?? null,
  };
  const issues: HealthIssue[] = [];
  let score = 0;

  for (const field of ['name', 'address', 'phone', 'website', 'regularHours', 'categories', 'images'] as const) {
    const weight = FIELD_WEIGHTS[field];
    const expected = canonical[field];
    const actual = provider[field];
    if (expected === null || expected === undefined || comparableJson(expected) === '') {
      issues.push(issue({ type: 'MISSING', severity: field === 'name' || field === 'address' ? 'CRITICAL' : 'WARNING', field, expected: null, observed: actual === null || actual === undefined ? null : json(actual), explanation: `Каноническое поле ${field} не заполнено в Business Shield; согласованность нельзя подтвердить.` }));
      continue;
    }
    if (actual === null || actual === undefined || comparableJson(actual) === '') {
      issues.push(issue({ type: 'MISSING', severity: field === 'name' || field === 'address' || field === 'phone' ? 'CRITICAL' : 'WARNING', field, expected: json(expected), observed: null, explanation: `Во внешнем listing отсутствует поле ${field}, которое заполнено в каноническом профиле.` }));
      continue;
    }
    if (comparableJson(expected) !== comparableJson(actual)) {
      issues.push(issue({ type: 'MISMATCH', severity: field === 'name' || field === 'address' || field === 'phone' ? 'CRITICAL' : 'WARNING', field, expected: json(expected), observed: json(actual), explanation: `Значение ${field} во внешнем listing отличается от канонического профиля.` }));
      continue;
    }
    score += weight;
  }

  const freshnessDate = observed.providerUpdatedAt ?? observed.observedAt ?? now;
  const ageMs = Math.max(0, now.getTime() - freshnessDate.getTime());
  if (ageMs > STALE_AFTER_MS) {
    issues.push(issue({ type: 'STALE', severity: 'WARNING', field: 'freshness', expected: json('<=30d'), observed: json(`${Math.floor(ageMs / 86_400_000)}d`), explanation: 'Последнее подтверждённое обновление listing старше 30 дней.' }));
  } else {
    score += FIELD_WEIGHTS.freshness;
  }

  return { score: Math.max(0, Math.min(100, score)), scoreVersion: LISTING_HEALTH_SCORE_VERSION, canonical, provider, issues };
}

async function tenantLocation(prisma: PrismaClient, organizationId: string, locationId: string) {
  const location = await prisma.location.findFirst({
    where: { id: locationId, business: { organizationId } },
    include: { business: { select: { id: true, name: true, organizationId: true } } },
  });
  if (!location) throw new AppError({ code: 'LOCATION_NOT_FOUND', message: 'Локация не найдена', statusCode: 404 });
  return location;
}

async function audit(app: FastifyInstance, actor: TenantActor, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
  await app.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.userId, action, entityType: 'LocationListing', entityId, ...(metadata !== undefined ? { metadata } : {}) } });
}

export async function updateCanonicalLocation(app: FastifyInstance, actor: TenantActor, locationId: string, input: CanonicalPatch) {
  const location = await tenantLocation(app.prisma, actor.organizationId, locationId);
  const updated = await app.prisma.location.update({
    where: { id: location.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
      ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
      ...(input.regularHours !== undefined ? { regularHours: input.regularHours === null ? null : json(input.regularHours) } : {}),
      ...(input.categories !== undefined ? { categories: input.categories === null ? null : json(input.categories) } : {}),
      ...(input.attributes !== undefined ? { attributes: input.attributes === null ? null : json(input.attributes) } : {}),
      ...(input.images !== undefined ? { images: input.images === null ? null : json(input.images) } : {}),
    },
  });
  await audit(app, actor, 'listing.canonical.updated', locationId, json({ changedFields: Object.keys(input) }));
  return updated;
}

export async function createListingSource(app: FastifyInstance, actor: TenantActor, locationId: string, input: { integrationAccountId: string; externalLocationId: string }) {
  await tenantLocation(app.prisma, actor.organizationId, locationId);
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: input.integrationAccountId, organizationId: actor.organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
  const adapter = providerRegistry.get(account.provider);
  if (!adapter || !adapter.capabilities.includes('profile.read') || !adapter.syncLocationProfiles) {
    throw new AppError({ code: 'LISTING_PROVIDER_PROFILE_UNSUPPORTED', message: 'Провайдер не поддерживает чтение location profile', statusCode: 409 });
  }
  try {
    const source = await app.prisma.listingSource.create({
      data: { organizationId: actor.organizationId, locationId, integrationAccountId: account.id, provider: account.provider, externalLocationId: input.externalLocationId },
    });
    await audit(app, actor, 'listing.source.linked', source.id, json({ locationId, provider: account.provider, externalLocationId: input.externalLocationId }));
    return source;
  } catch (error: any) {
    if (error?.code === 'P2002') throw new AppError({ code: 'LISTING_SOURCE_ALREADY_MAPPED', message: 'Эта внешняя локация уже сопоставлена', statusCode: 409 });
    throw error;
  }
}

function providerContext(account: any, credentials: Record<string, string>): ProviderConnectionContext {
  const configuration = account.configuration && typeof account.configuration === 'object' && !Array.isArray(account.configuration) ? account.configuration as Record<string, unknown> : {};
  return { organizationId: account.organizationId, accountId: account.id, provider: account.provider, externalAccountId: account.externalAccountId, configuration, credentials };
}

export async function enqueueListingSync(app: FastifyInstance, actor: TenantActor, sourceId: string) {
  const source = await app.prisma.listingSource.findFirst({ where: { id: sourceId, organizationId: actor.organizationId }, include: { integrationAccount: true } });
  if (!source) throw new AppError({ code: 'LISTING_SOURCE_NOT_FOUND', message: 'Listing source не найден', statusCode: 404 });
  const adapter = providerRegistry.get(source.provider);
  if (!adapter || !adapter.syncLocationProfiles) throw new AppError({ code: 'LISTING_PROVIDER_PROFILE_UNSUPPORTED', message: 'Провайдер не поддерживает синхронизацию listing profile', statusCode: 409 });
  const existing = await app.prisma.job.findFirst({ where: { organizationId: actor.organizationId, type: 'listing.sync', status: { in: ['QUEUED', 'RUNNING'] }, payload: { path: ['sourceId'], equals: sourceId } } });
  if (existing) return { job: existing, deduplicated: true };
  const job = await app.prisma.job.create({ data: { organizationId: actor.organizationId, type: 'listing.sync', payload: { organizationId: actor.organizationId, sourceId }, dedupeKey: `listing.sync:${sourceId}:${Date.now()}`, maxAttempts: 5 } });
  await audit(app, actor, 'listing.sync.queued', source.id, json({ jobId: job.id }));
  return { job, deduplicated: false };
}

function safeProviderError(error: unknown) {
  if (error instanceof ProviderAdapterError) return { code: error.code, message: error.message, retryable: error.retryable };
  if (error instanceof AppError) return { code: error.code, message: error.message, retryable: false };
  return { code: 'LISTING_SYNC_FAILED', message: 'Не удалось синхронизировать listing profile', retryable: true };
}

export async function processListingSyncJob(prisma: PrismaClient, input: { organizationId: string; sourceId: string }) {
  const source = await prisma.listingSource.findFirst({ where: { id: input.sourceId, organizationId: input.organizationId }, include: { integrationAccount: true, location: { include: { business: true } } } });
  if (!source) throw new AppError({ code: 'LISTING_SOURCE_NOT_FOUND', message: 'Listing source не найден', statusCode: 404 });
  const adapter = providerRegistry.get(source.provider);
  if (!adapter || !adapter.syncLocationProfiles) throw new AppError({ code: 'LISTING_PROVIDER_PROFILE_UNSUPPORTED', message: 'Провайдер не поддерживает синхронизацию location profile', statusCode: 409 });
  try {
    const credentials = await loadIntegrationCredentialsFromPrisma(prisma, input.organizationId, source.integrationAccountId);
    const records = await adapter.syncLocationProfiles(providerContext(source.integrationAccount, credentials));
    const record = records.find((candidate) => candidate.externalId === source.externalLocationId);
    if (!record) {
      await prisma.listingSource.update({ where: { id: source.id }, data: { status: 'ERROR', lastErrorCode: 'LISTING_PROVIDER_LOCATION_NOT_FOUND', lastErrorMessage: 'Сопоставленная внешняя локация не вернулась из provider profile sync.' } });
      throw new AppError({ code: 'LISTING_PROVIDER_LOCATION_NOT_FOUND', message: 'Сопоставленная внешняя локация не найдена у провайдера', statusCode: 404 });
    }
    const measurement = calculateLocationHealth(source.location, record);
    return await prisma.$transaction(async (tx) => {
      const snapshot = await tx.listingSnapshot.create({
        data: { organizationId: input.organizationId, locationId: source.locationId, sourceId: source.id, observedAt: record.observedAt ?? new Date(), providerUpdatedAt: record.providerUpdatedAt ?? null, normalized: json(measurement.provider), raw: record.raw ? json(record.raw) : undefined, healthScore: measurement.score, scoreVersion: measurement.scoreVersion },
      });
      if (measurement.issues.length) {
        await tx.listingHealthIssue.createMany({ data: measurement.issues.map((item) => ({ organizationId: input.organizationId, locationId: source.locationId, snapshotId: snapshot.id, type: item.type, severity: item.severity, field: item.field, expected: item.expected === null ? undefined : item.expected, observed: item.observed === null ? undefined : item.observed, explanation: item.explanation })) });
      }
      const duplicate = await tx.listingSnapshot.findFirst({
        where: { organizationId: input.organizationId, locationId: { not: source.locationId }, source: { provider: source.provider }, normalized: { path: ['address'], equals: measurement.provider.address ?? '__none__' } },
        orderBy: { observedAt: 'desc' },
      });
      if (duplicate && measurement.provider.address) {
        await tx.listingHealthIssue.create({ data: { organizationId: input.organizationId, locationId: source.locationId, snapshotId: snapshot.id, type: 'DUPLICATE', severity: 'WARNING', field: 'address', observed: json(measurement.provider.address), explanation: 'Такой же адрес обнаружен в другом сопоставленном listing этого провайдера; проверьте дубликат.' } });
      }
      await tx.listingSource.update({ where: { id: source.id }, data: { status: 'ACTIVE', lastSyncedAt: new Date(), lastErrorCode: null, lastErrorMessage: null } });
      return snapshot;
    });
  } catch (error) {
    const safe = safeProviderError(error);
    await prisma.listingSource.updateMany({ where: { id: source.id }, data: { status: safe.retryable ? 'DEGRADED' : 'ERROR', lastErrorCode: safe.code, lastErrorMessage: safe.message } });
    throw error;
  }
}

export async function listingHealthOverview(app: FastifyInstance, organizationId: string, input: { businessId?: string; status?: 'ACTIVE' | 'DEGRADED' | 'ERROR' | 'DISABLED' }) {
  const locations = await app.prisma.location.findMany({
    where: { business: { organizationId, ...(input.businessId ? { id: input.businessId } : {}) }, status: 'ACTIVE' },
    include: {
      business: { select: { id: true, name: true } },
      listingSources: {
        where: input.status ? { status: input.status } : undefined,
        include: { snapshots: { orderBy: { observedAt: 'desc' }, take: 1, include: { issues: true } } },
      },
    },
    orderBy: [{ business: { isPrimary: 'desc' } }, { isPrimary: 'desc' }, { name: 'asc' }],
  });
  const items = locations.map((location) => {
    const latest = location.listingSources.flatMap((source) => source.snapshots.map((snapshot) => ({ source, snapshot })));
    const measured = latest.map((entry) => entry.snapshot.healthScore);
    const score = measured.length ? Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length) : null;
    const issues = latest.flatMap((entry) => entry.snapshot.issues);
    return { ...location, health: { measured: measured.length > 0, score, scoreVersion: LISTING_HEALTH_SCORE_VERSION, sourceCount: location.listingSources.length, measuredSourceCount: measured.length, criticalIssues: issues.filter((item) => item.severity === 'CRITICAL').length, warningIssues: issues.filter((item) => item.severity === 'WARNING').length } };
  });
  const measuredScores = items.flatMap((item) => item.health.score === null ? [] : [item.health.score]);
  return { items, summary: { locationCount: items.length, measuredLocations: measuredScores.length, averageHealthScore: measuredScores.length ? Math.round(measuredScores.reduce((sum, value) => sum + value, 0) / measuredScores.length) : null }, methodology: { scoreVersion: LISTING_HEALTH_SCORE_VERSION, weights: FIELD_WEIGHTS, staleAfterDays: 30 } };
}

export async function listingHealthDetail(app: FastifyInstance, organizationId: string, locationId: string) {
  await tenantLocation(app.prisma, organizationId, locationId);
  const location = await app.prisma.location.findFirstOrThrow({
    where: { id: locationId },
    include: { business: { select: { id: true, name: true } }, listingSources: { include: { integrationAccount: { select: { id: true, name: true, provider: true, status: true } }, snapshots: { orderBy: { observedAt: 'desc' }, take: 20, include: { issues: true } } } } },
  });
  return { location, methodology: { scoreVersion: LISTING_HEALTH_SCORE_VERSION, weights: FIELD_WEIGHTS, staleAfterDays: 30 } };
}
