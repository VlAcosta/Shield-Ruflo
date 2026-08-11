import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AddCompetitiveSnapshotInput, CreateCompetitorInput } from './competitive.schemas.js';
import {
  getGooglePlaceLive,
  googlePlacesAvailability,
  searchGooglePlacesLive,
  type GooglePlacesLivePlace,
} from './google-places-live.client.js';

const competitorInclude = {
  locations: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      sources: { orderBy: { createdAt: 'asc' as const } },
      metricSnapshots: {
        orderBy: { observedAt: 'desc' as const },
        take: 1,
        include: { source: { select: { provider: true, storagePolicy: true } } },
      },
    },
  },
  createdBy: { select: { id: true, displayName: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.CompetitiveCompetitorInclude;

function displayPerson(user: { displayName?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined) {
  if (!user) return null;
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || null;
}

function presentSnapshot(row: any) {
  return {
    id: row.id,
    observedAt: row.observedAt?.toISOString?.() ?? row.observedAt,
    averageRating: row.averageRating,
    reviewCount: row.reviewCount,
    reviewVelocity30d: row.reviewVelocity30d,
    positiveShare: row.positiveShare,
    negativeShare: row.negativeShare,
    responseRate: row.responseRate,
    reputationScore: row.reputationScore,
    notes: row.notes,
    provider: row.source?.provider ? String(row.source.provider).toLowerCase() : null,
    storagePolicy: row.source?.storagePolicy ? String(row.source.storagePolicy).toLowerCase() : null,
  };
}

function presentCompetitor(row: any) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    status: String(row.status).toLowerCase(),
    notes: row.notes,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    createdBy: row.createdBy ? { id: row.createdBy.id, name: displayPerson(row.createdBy) } : null,
    locations: (row.locations ?? []).map((location: any) => ({
      id: location.id,
      name: location.name,
      addressLabel: location.addressLabel,
      city: location.city,
      region: location.region,
      countryCode: location.countryCode,
      website: location.website,
      sources: (location.sources ?? []).map((source: any) => ({
        id: source.id,
        provider: String(source.provider).toLowerCase(),
        externalId: source.externalId,
        storagePolicy: String(source.storagePolicy).toLowerCase(),
        status: String(source.status).toLowerCase(),
        lastCheckedAt: source.lastCheckedAt?.toISOString?.() ?? null,
        lastErrorCode: source.lastErrorCode,
      })),
      latestSnapshot: location.metricSnapshots?.[0] ? presentSnapshot(location.metricSnapshots[0]) : null,
    })),
  };
}

async function tenantCompetitor(app: FastifyInstance, organizationId: string, competitorId: string) {
  const row = await app.prisma.competitiveCompetitor.findFirst({
    where: { id: competitorId, organizationId, archivedAt: null },
    include: competitorInclude,
  });
  if (!row) throw new AppError({ code: 'COMPETITOR_NOT_FOUND', message: 'Конкурент не найден', statusCode: 404 });
  return row;
}

async function tenantLocation(app: FastifyInstance, organizationId: string, competitorId: string, locationId: string) {
  const row = await app.prisma.competitiveLocation.findFirst({
    where: { id: locationId, organizationId, competitorId, competitor: { organizationId, archivedAt: null } },
    include: { sources: true },
  });
  if (!row) throw new AppError({ code: 'COMPETITOR_LOCATION_NOT_FOUND', message: 'Локация конкурента не найдена', statusCode: 404 });
  return row;
}

export async function createCompetitor(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  input: CreateCompetitorInput,
) {
  const created = await app.prisma.$transaction(async (tx) => {
    const competitor = await tx.competitiveCompetitor.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        website: input.website ?? null,
        notes: input.notes,
        createdByUserId: context.userId,
      },
    });
    for (const location of input.locations) {
      const createdLocation = await tx.competitiveLocation.create({
        data: {
          organizationId: context.organizationId,
          competitorId: competitor.id,
          name: location.name,
          addressLabel: location.addressLabel ?? null,
          city: location.city ?? null,
          region: location.region ?? null,
          countryCode: location.countryCode ?? null,
          website: location.website ?? null,
        },
      });
      await tx.competitiveSource.create({
        data: {
          organizationId: context.organizationId,
          competitorLocationId: createdLocation.id,
          provider: 'MANUAL',
          storagePolicy: 'PERSISTABLE',
          status: 'CONFIGURED',
        },
      });
      if (location.googlePlaceId) {
        await tx.competitiveSource.create({
          data: {
            organizationId: context.organizationId,
            competitorLocationId: createdLocation.id,
            provider: 'GOOGLE_PLACES',
            externalId: location.googlePlaceId,
            storagePolicy: 'LIVE_ONLY',
            status: 'CONFIGURED',
          },
        });
      }
    }
    await tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'competitive.competitor_created',
        entityType: 'CompetitiveCompetitor',
        entityId: competitor.id,
        metadata: { locationCount: input.locations.length, googleLinked: input.locations.filter((item) => Boolean(item.googlePlaceId)).length },
      },
    });
    return competitor;
  });
  return presentCompetitor(await tenantCompetitor(app, context.organizationId, created.id));
}

export async function updateCompetitor(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  competitorId: string,
  patch: { name?: string; website?: string | null; notes?: string; status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' },
) {
  const existing = await app.prisma.competitiveCompetitor.findFirst({ where: { id: competitorId, organizationId: context.organizationId, archivedAt: null } });
  if (!existing) throw new AppError({ code: 'COMPETITOR_NOT_FOUND', message: 'Конкурент не найден', statusCode: 404 });
  await app.prisma.$transaction([
    app.prisma.competitiveCompetitor.update({
      where: { id: existing.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.website !== undefined ? { website: patch.website } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.status !== undefined ? { status: patch.status, ...(patch.status === 'ARCHIVED' ? { archivedAt: new Date() } : {}) } : {}),
      },
    }),
    app.prisma.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'competitive.competitor_updated',
        entityType: 'CompetitiveCompetitor',
        entityId: existing.id,
        metadata: { fields: Object.keys(patch) },
      },
    }),
  ]);
  return presentCompetitor(await tenantCompetitor(app, context.organizationId, existing.id));
}

export async function listCompetitors(app: FastifyInstance, organizationId: string, query: { status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'; limit: number; cursor?: string }) {
  const rows = await app.prisma.competitiveCompetitor.findMany({
    where: {
      organizationId,
      ...(query.status ? { status: query.status } : { archivedAt: null }),
    },
    include: competitorInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return { items: page.map(presentCompetitor), nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
}

export async function getCompetitor(app: FastifyInstance, organizationId: string, competitorId: string) {
  return presentCompetitor(await tenantCompetitor(app, organizationId, competitorId));
}

export async function addCompetitiveSnapshot(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  competitorId: string,
  locationId: string,
  input: AddCompetitiveSnapshotInput,
) {
  const location = await tenantLocation(app, context.organizationId, competitorId, locationId);
  const source = location.sources.find((item) => item.provider === 'MANUAL' && item.storagePolicy === 'PERSISTABLE');
  if (!source) {
    throw new AppError({ code: 'COMPETITIVE_PERSISTABLE_SOURCE_REQUIRED', message: 'Для этой локации нет источника, разрешающего хранение истории', statusCode: 409 });
  }
  if (input.dedupeKey) {
    const existing = await app.prisma.competitiveMetricSnapshot.findFirst({ where: { sourceId: source.id, dedupeKey: input.dedupeKey } });
    if (existing) return { snapshot: presentSnapshot({ ...existing, source }), deduplicated: true };
  }
  const observedAt = input.observedAt ? new Date(input.observedAt) : new Date();
  const snapshot = await app.prisma.$transaction(async (tx) => {
    const created = await tx.competitiveMetricSnapshot.create({
      data: {
        organizationId: context.organizationId,
        competitorLocationId: location.id,
        sourceId: source.id,
        observedAt,
        averageRating: input.averageRating ?? null,
        reviewCount: input.reviewCount ?? null,
        reviewVelocity30d: input.reviewVelocity30d ?? null,
        positiveShare: input.positiveShare ?? null,
        negativeShare: input.negativeShare ?? null,
        responseRate: input.responseRate ?? null,
        reputationScore: input.reputationScore ?? null,
        notes: input.notes,
        dedupeKey: input.dedupeKey ?? null,
        createdByUserId: context.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'competitive.snapshot_created',
        entityType: 'CompetitiveMetricSnapshot',
        entityId: created.id,
        metadata: { competitorId, locationId, source: 'MANUAL', observedAt: observedAt.toISOString() },
      },
    });
    return created;
  });
  return { snapshot: presentSnapshot({ ...snapshot, source }), deduplicated: false };
}

export async function listCompetitiveSnapshots(
  app: FastifyInstance,
  organizationId: string,
  competitorId: string,
  locationId: string,
  query: { from?: string; to?: string; limit: number },
) {
  await tenantLocation(app, organizationId, competitorId, locationId);
  const rows = await app.prisma.competitiveMetricSnapshot.findMany({
    where: {
      organizationId,
      competitorLocationId: locationId,
      observedAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    },
    include: { source: { select: { provider: true, storagePolicy: true } } },
    orderBy: { observedAt: 'desc' },
    take: query.limit,
  });
  return { items: rows.map(presentSnapshot) };
}

function presentGoogleLive(place: GooglePlacesLivePlace) {
  return {
    placeId: place.id,
    name: place.displayName?.text ?? null,
    formattedAddress: place.formattedAddress ?? null,
    location: place.location ?? null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    websiteUri: place.websiteUri ?? null,
    googleMapsUri: place.googleMapsUri ?? null,
    reviews: (place.reviews ?? []).slice(0, 5).map((review) => ({
      rating: review.rating ?? null,
      text: review.text?.text ?? null,
      languageCode: review.text?.languageCode ?? null,
      originalText: review.originalText?.text ?? null,
      publishTime: review.publishTime ?? null,
      relativePublishTimeDescription: review.relativePublishTimeDescription ?? null,
      googleMapsUri: review.googleMapsUri ?? null,
      authorAttribution: review.authorAttribution ?? null,
    })),
    attributions: place.attributions ?? [],
    source: {
      provider: 'google_places',
      storagePolicy: 'live_only',
      persisted: false,
      reviewSampleLimit: 5,
      attributionRequired: true,
      limitations: ['GOOGLE_PLACES_CONTENT_NOT_STORED', 'REVIEW_SAMPLE_MAX_5'],
    },
  };
}

export async function discoverGoogleCompetitors(query: string, languageCode: string) {
  const places = await searchGooglePlacesLive(query, languageCode);
  return {
    availability: googlePlacesAvailability(),
    items: places.map((place) => ({
      placeId: place.id,
      name: place.displayName?.text ?? null,
      formattedAddress: place.formattedAddress ?? null,
      location: place.location ?? null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      websiteUri: place.websiteUri ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
      source: { provider: 'google_places', storagePolicy: 'live_only', persisted: false, attributionRequired: true },
    })),
  };
}

export async function getLiveCompetitorLocation(
  app: FastifyInstance,
  organizationId: string,
  competitorId: string,
  locationId: string,
  languageCode: string,
) {
  const location = await tenantLocation(app, organizationId, competitorId, locationId);
  const source = location.sources.find((item) => item.provider === 'GOOGLE_PLACES' && item.storagePolicy === 'LIVE_ONLY');
  if (!source?.externalId) {
    throw new AppError({ code: 'GOOGLE_PLACE_LINK_REQUIRED', message: 'Локация конкурента не связана с Google Place ID', statusCode: 409 });
  }
  try {
    const place = await getGooglePlaceLive(source.externalId, languageCode);
    await app.prisma.competitiveSource.update({ where: { id: source.id }, data: { status: 'CONFIGURED', lastCheckedAt: new Date(), lastErrorCode: null } });
    return presentGoogleLive(place);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'GOOGLE_PLACES_REQUEST_FAILED';
    await app.prisma.competitiveSource.update({ where: { id: source.id }, data: { status: 'ERROR', lastCheckedAt: new Date(), lastErrorCode: code.slice(0, 120) } });
    throw error;
  }
}

async function ownMetrics(
  app: FastifyInstance,
  organizationId: string,
  input: { businessId?: string; locationId?: string; from?: string; to?: string },
) {
  if (input.businessId) {
    const business = await app.prisma.business.findFirst({ where: { id: input.businessId, organizationId }, select: { id: true } });
    if (!business) throw new AppError({ code: 'BUSINESS_NOT_FOUND', message: 'Бизнес не найден', statusCode: 404 });
  }
  if (input.locationId) {
    const location = await app.prisma.location.findFirst({ where: { id: input.locationId, business: { organizationId, ...(input.businessId ? { id: input.businessId } : {}) } }, select: { id: true } });
    if (!location) throw new AppError({ code: 'LOCATION_NOT_FOUND', message: 'Локация не найдена', statusCode: 404 });
  }
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from >= to) throw new AppError({ code: 'COMPETITIVE_PERIOD_INVALID', message: 'Начало периода должно быть раньше окончания', statusCode: 400 });
  const reviews = await app.prisma.review.findMany({
    where: {
      organizationId,
      status: { not: 'ARCHIVED' },
      receivedAt: { gte: from, lte: to },
      ...(input.businessId ? { businessId: input.businessId } : {}),
      ...(input.locationId ? { locationId: input.locationId } : {}),
    },
    select: { rating: true, repliedAt: true },
  });
  const count = reviews.length;
  const days = Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);
  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    averageRating: count ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / count).toFixed(2)) : null,
    reviewCount: count,
    reviewVelocity30d: Number((count * (30 / days)).toFixed(2)),
    positiveShare: count ? Number((reviews.filter((review) => review.rating >= 4).length / count).toFixed(4)) : 0,
    negativeShare: count ? Number((reviews.filter((review) => review.rating <= 2).length / count).toFixed(4)) : 0,
    responseRate: count ? Number((reviews.filter((review) => Boolean(review.repliedAt)).length / count).toFixed(4)) : 0,
  };
}

function delta(ours: number | null | undefined, theirs: number | null | undefined) {
  return typeof ours === 'number' && typeof theirs === 'number' ? Number((ours - theirs).toFixed(4)) : null;
}

export async function competitiveBenchmark(
  app: FastifyInstance,
  organizationId: string,
  input: { businessId?: string; locationId?: string; from?: string; to?: string },
) {
  const ours = await ownMetrics(app, organizationId, input);
  const competitors = await app.prisma.competitiveCompetitor.findMany({
    where: { organizationId, status: 'ACTIVE', archivedAt: null },
    include: competitorInclude,
    orderBy: { createdAt: 'asc' },
  });
  const items = competitors.flatMap((competitor) => competitor.locations.map((location) => {
    const snapshot = location.metricSnapshots[0];
    const metrics = snapshot ? presentSnapshot(snapshot) : null;
    const available = metrics ? [
      ['averageRating', metrics.averageRating],
      ['reviewCount', metrics.reviewCount],
      ['reviewVelocity30d', metrics.reviewVelocity30d],
      ['positiveShare', metrics.positiveShare],
      ['negativeShare', metrics.negativeShare],
      ['responseRate', metrics.responseRate],
    ].filter(([, value]) => typeof value === 'number').map(([key]) => key) : [];
    return {
      competitorId: competitor.id,
      competitorName: competitor.name,
      locationId: location.id,
      locationName: location.name,
      metrics,
      coverage: { availableMetrics: available, liveGoogleLinked: location.sources.some((source) => source.provider === 'GOOGLE_PLACES') },
      deltas: metrics ? {
        averageRating: delta(ours.averageRating, metrics.averageRating),
        reviewCount: delta(ours.reviewCount, metrics.reviewCount),
        reviewVelocity30d: delta(ours.reviewVelocity30d, metrics.reviewVelocity30d),
        positiveShare: delta(ours.positiveShare, metrics.positiveShare),
        negativeShare: delta(ours.negativeShare, metrics.negativeShare),
        responseRate: delta(ours.responseRate, metrics.responseRate),
      } : null,
    };
  }));
  return {
    own: ours,
    competitors: items,
    methodology: {
      competitorHistory: 'persistable_sources_only',
      googlePlaces: 'live_only_not_persisted',
      comparisonWarning: 'Manual/provider snapshots may represent a different observation window; coverage is returned per metric.',
    },
  };
}

export function competitiveProviderAvailability() {
  return { googlePlaces: googlePlacesAvailability() };
}
