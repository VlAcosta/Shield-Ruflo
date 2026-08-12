import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] as const;
const PRO_TRIAL_DAYS = 14;

export const PUBLIC_PLAN_CODES = ['START', 'GROWTH', 'PRO', 'BUSINESS'] as const;
export type PublicPlanCode = (typeof PUBLIC_PLAN_CODES)[number];

export type UsageLimitKey =
  | 'locations.max'
  | 'review_sources.max'
  | 'users.max'
  | 'automation_rules.max'
  | 'competitors.max';

const LEGACY_LIMIT_ALIASES: Readonly<Partial<Record<UsageLimitKey, string>>> = Object.freeze({
  'locations.max': 'maxLocations',
  'review_sources.max': 'maxReviewSources',
  'users.max': 'maxUsers',
});

async function activeSubscription(app: FastifyInstance, organizationId: string) {
  return app.prisma.subscription.findFirst({
    where: { organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
    include: { plan: { include: { entitlements: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * FREE is deliberately retained as a legacy/grandfathering safety net while
 * production checkout is provider-gated. It is not returned by the public
 * pricing catalog. Existing organizations are never silently migrated to a
 * more expensive plan by a GET request or deployment migration.
 */
export async function ensureFreeSubscription(app: FastifyInstance, organizationId: string) {
  let existing = await activeSubscription(app, organizationId);
  if (existing?.status === 'TRIALING' && existing.currentPeriodEnd && existing.currentPeriodEnd <= new Date()) {
    await app.prisma.subscription.update({ where: { id: existing.id }, data: { status: 'EXPIRED', autoRenew: false } });
    existing = null;
  }
  if (existing) return existing;

  const freePlan = await app.prisma.plan.findFirst({ where: { code: 'FREE', active: true }, include: { entitlements: true } });
  if (!freePlan) {
    throw new AppError({ code: 'FREE_PLAN_NOT_CONFIGURED', message: 'Базовый тариф не настроен', statusCode: 503 });
  }

  return app.prisma.subscription.create({
    data: { organizationId, planId: freePlan.id, status: 'ACTIVE', provider: null, autoRenew: false },
    include: { plan: { include: { entitlements: true } } },
  });
}

function planEntitlementMap(plan: { entitlements?: Array<{ key: string; value: unknown }> } | null | undefined): Record<string, unknown> {
  return Object.fromEntries((plan?.entitlements ?? []).map((item) => [item.key, item.value]));
}

function entitlementMap(subscription: { plan?: { entitlements?: Array<{ key: string; value: unknown }> } } | null | undefined): Record<string, unknown> {
  return planEntitlementMap(subscription?.plan);
}

function numericEntitlement(entitlements: Record<string, unknown>, key: string, legacyKey?: string): number | null {
  const direct = entitlements[key];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  if (legacyKey) {
    const legacy = entitlements[legacyKey];
    if (typeof legacy === 'number' && Number.isFinite(legacy)) return legacy;
  }
  return null;
}

function currentMonthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function usageState(used: number, limit: number | null) {
  if (!limit || limit <= 0) return { ratio: null, percentage: null, state: 'unmetered' as const };
  const ratio = used / limit;
  const percentage = Math.min(100, Math.round(ratio * 100));
  if (ratio >= 1) return { ratio, percentage, state: 'limit' as const };
  if (ratio >= 0.9) return { ratio, percentage, state: 'critical' as const };
  if (ratio >= 0.7) return { ratio, percentage, state: 'warning' as const };
  return { ratio, percentage, state: 'ok' as const };
}

async function rawUsage(app: FastifyInstance, organizationId: string) {
  const { start, end } = currentMonthRange();
  const now = new Date();
  const [locations, reviewSources, users, reviews, aiActions, automationRules, competitors] = await Promise.all([
    app.prisma.location.count({
      where: { status: 'ACTIVE', business: { organizationId, status: 'ACTIVE' } },
    }),
    app.prisma.reviewSource.count({ where: { organizationId, status: 'ACTIVE' } }),
    app.prisma.organizationMember.count({
      where: {
        organizationId,
        status: 'ACTIVE',
        AND: [{ OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: now } }] }],
      },
    }),
    app.prisma.review.count({ where: { organizationId, receivedAt: { gte: start, lt: end } } }),
    app.prisma.aiOperation.count({ where: { organizationId, createdAt: { gte: start, lt: end } } }),
    app.prisma.automation.count({ where: { organizationId, enabled: true } }),
    app.prisma.competitiveCompetitor.count({ where: { organizationId, status: 'ACTIVE' } }),
  ]);

  return { locations, reviewSources, users, reviews, aiActions, automationRules, competitors, periodStart: start, periodEnd: end };
}

export async function getUsageSnapshot(
  app: FastifyInstance,
  organizationId: string,
  suppliedEntitlements?: Record<string, unknown>,
) {
  const entitlements = suppliedEntitlements ?? entitlementMap(await ensureFreeSubscription(app, organizationId));
  const raw = await rawUsage(app, organizationId);
  const meters = [
    { key: 'locations', entitlementKey: 'locations.max', used: raw.locations, limit: numericEntitlement(entitlements, 'locations.max', 'maxLocations') },
    { key: 'review_sources', entitlementKey: 'review_sources.max', used: raw.reviewSources, limit: numericEntitlement(entitlements, 'review_sources.max', 'maxReviewSources') },
    { key: 'reviews', entitlementKey: 'reviews.monthly', used: raw.reviews, limit: numericEntitlement(entitlements, 'reviews.monthly') },
    { key: 'users', entitlementKey: 'users.max', used: raw.users, limit: numericEntitlement(entitlements, 'users.max', 'maxUsers') },
    { key: 'ai_actions', entitlementKey: 'ai_actions.monthly', used: raw.aiActions, limit: numericEntitlement(entitlements, 'ai_actions.monthly') },
    { key: 'automation_rules', entitlementKey: 'automation_rules.max', used: raw.automationRules, limit: numericEntitlement(entitlements, 'automation_rules.max') },
    { key: 'competitors', entitlementKey: 'competitors.max', used: raw.competitors, limit: numericEntitlement(entitlements, 'competitors.max') },
  ].map((meter) => ({ ...meter, ...usageState(meter.used, meter.limit) }));

  return {
    periodStart: raw.periodStart.toISOString(),
    periodEnd: raw.periodEnd.toISOString(),
    meters,
  };
}

function publicPlanDto(plan: {
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  entitlements: Array<{ key: string; value: unknown }>;
}) {
  const entitlements = planEntitlementMap(plan);
  const annualDiscountPercent = numericEntitlement(entitlements, 'billing.annual_discount_percent') ?? 15;
  const annualPriceCents = Math.round(plan.priceCents * 12 * (1 - annualDiscountPercent / 100));
  return {
    id: plan.code,
    code: plan.code,
    name: plan.name,
    price: Number((plan.priceCents / 100).toFixed(2)),
    priceCents: plan.priceCents,
    currency: plan.currency,
    annualDiscountPercent,
    annualPriceCents,
    annualMonthlyEquivalentCents: Math.round(annualPriceCents / 12),
    entitlements,
  };
}

export async function getPublicBillingCatalog(app: FastifyInstance) {
  const plans = await app.prisma.plan.findMany({
    where: { active: true, code: { in: [...PUBLIC_PLAN_CODES] } },
    include: { entitlements: true },
  });
  const order = new Map(PUBLIC_PLAN_CODES.map((code, index) => [code, index]));
  return plans
    .sort((left, right) => (order.get(left.code as PublicPlanCode) ?? 999) - (order.get(right.code as PublicPlanCode) ?? 999))
    .map(publicPlanDto);
}

export async function getBillingSnapshot(app: FastifyInstance, organizationId: string) {
  const subscription = await ensureFreeSubscription(app, organizationId);
  const [plans, priorPro] = await Promise.all([
    getPublicBillingCatalog(app),
    app.prisma.subscription.findFirst({ where: { organizationId, plan: { code: 'PRO' } }, select: { id: true } }),
  ]);
  const entitlements = entitlementMap(subscription);
  const usage = await getUsageSnapshot(app, organizationId, entitlements);
  return {
    subscription: {
      id: subscription.id,
      status: subscription.status,
      provider: subscription.provider,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      autoRenew: subscription.autoRenew,
    },
    plan: {
      id: subscription.plan.code,
      code: subscription.plan.code,
      name: subscription.plan.name,
      price: Number((subscription.plan.priceCents / 100).toFixed(2)),
      priceCents: subscription.plan.priceCents,
      currency: subscription.plan.currency,
      billingLabel: 'месяц',
      activeUntil: subscription.currentPeriodEnd?.toISOString?.() ?? null,
      autoRenew: subscription.autoRenew,
      legacy: subscription.plan.code === 'FREE',
    },
    availablePlans: plans,
    entitlements,
    limits: Object.entries(entitlements)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => ({ key, value })),
    usage,
    packages: [],
    payments: [],
    paymentProviderConfigured: false,
    trial: { available: !priorPro && subscription.plan.code === 'FREE', days: PRO_TRIAL_DAYS, targetPlan: 'PRO' },
  };
}

export async function startProTrial(app: FastifyInstance, organizationId: string) {
  await app.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing:pro-trial:${organizationId}`}, 0))`;
    const pro = await tx.plan.findFirst({ where: { code: 'PRO', active: true } });
    if (!pro) throw new AppError({ code: 'PRO_PLAN_NOT_CONFIGURED', message: 'Тариф PRO не настроен', statusCode: 503 });
    const used = await tx.subscription.findFirst({ where: { organizationId, planId: pro.id }, select: { id: true } });
    if (used) throw new AppError({ code: 'PRO_TRIAL_ALREADY_USED', message: 'Пробный период PRO для этой организации уже использован', statusCode: 409 });

    const now = new Date();
    const currentPeriodEnd = new Date(now.getTime() + PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await tx.subscription.updateMany({
      where: { organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
      data: { status: 'CANCELED', autoRenew: false },
    });
    await tx.subscription.create({
      data: {
        organizationId,
        planId: pro.id,
        status: 'TRIALING',
        provider: 'internal_trial',
        currentPeriodStart: now,
        currentPeriodEnd,
        autoRenew: false,
      },
    });
  });
  return getBillingSnapshot(app, organizationId);
}

export async function assertEntitlement(app: FastifyInstance, organizationId: string, key: string) {
  const subscription = await ensureFreeSubscription(app, organizationId);
  const entitlement = subscription.plan.entitlements.find((item) => item.key === key);
  if (!entitlement || entitlement.value !== true) {
    throw new AppError({
      code: 'ENTITLEMENT_REQUIRED',
      message: 'Функция недоступна на текущем тарифе',
      statusCode: 403,
      details: { entitlement: key, plan: subscription.plan.code },
    });
  }
}

async function currentUsageForLimit(app: FastifyInstance, organizationId: string, key: UsageLimitKey): Promise<number> {
  const now = new Date();
  if (key === 'locations.max') {
    return app.prisma.location.count({ where: { status: 'ACTIVE', business: { organizationId, status: 'ACTIVE' } } });
  }
  if (key === 'review_sources.max') {
    return app.prisma.reviewSource.count({ where: { organizationId, status: 'ACTIVE' } });
  }
  if (key === 'users.max') {
    return app.prisma.organizationMember.count({
      where: {
        organizationId,
        status: 'ACTIVE',
        AND: [{ OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: now } }] }],
      },
    });
  }
  if (key === 'automation_rules.max') {
    return app.prisma.automation.count({ where: { organizationId, enabled: true } });
  }
  return app.prisma.competitiveCompetitor.count({ where: { organizationId, status: 'ACTIVE' } });
}

/**
 * Enforces hard capacity limits for resource creation. Review/AI monthly meters
 * intentionally use warning/grace semantics and are not wired into this hard
 * blocker, so critical reputation workflows are never suddenly disabled.
 */
export async function assertUsageLimit(
  app: FastifyInstance,
  organizationId: string,
  key: UsageLimitKey,
  increment = 1,
) {
  const subscription = await ensureFreeSubscription(app, organizationId);
  const entitlements = entitlementMap(subscription);
  const limit = numericEntitlement(entitlements, key, LEGACY_LIMIT_ALIASES[key]);
  if (limit === null || limit < 0) return;
  const used = await currentUsageForLimit(app, organizationId, key);
  if (used + increment <= limit) return;

  throw new AppError({
    code: 'PLAN_LIMIT_REACHED',
    message: 'Достигнут лимит текущего тарифа',
    statusCode: 409,
    details: {
      plan: subscription.plan.code,
      entitlement: key,
      used,
      requestedIncrement: increment,
      limit,
      upgradeRequired: true,
    },
  });
}
