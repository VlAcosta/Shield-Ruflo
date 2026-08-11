import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { isBillingProviderConfigured } from './providers/index.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] as const;
const PRO_TRIAL_DAYS = 14;

async function activeSubscription(app: FastifyInstance, organizationId: string) {
  return app.prisma.subscription.findFirst({
    where: { organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
    include: { plan: { include: { entitlements: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

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

function entitlementMap(subscription: any): Record<string, unknown> {
  return Object.fromEntries((subscription.plan?.entitlements ?? []).map((item: any) => [item.key, item.value]));
}

function paymentStatus(status: string) {
  if (status === 'SUCCEEDED') return 'paid';
  if (status === 'CANCELED') return 'canceled';
  if (status === 'FAILED') return 'failed';
  return 'pending';
}

export async function getBillingSnapshot(app: FastifyInstance, organizationId: string) {
  const subscription = await ensureFreeSubscription(app, organizationId);
  const [plans, priorPro, payments] = await Promise.all([
    app.prisma.plan.findMany({ where: { active: true }, include: { entitlements: true }, orderBy: { priceCents: 'asc' } }),
    app.prisma.subscription.findFirst({ where: { organizationId, plan: { code: 'PRO' } }, select: { id: true } }),
    app.prisma.payment.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  const entitlements = entitlementMap(subscription);
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
    },
    availablePlans: plans.map((plan) => ({
      id: plan.code,
      code: plan.code,
      name: plan.name,
      price: Number((plan.priceCents / 100).toFixed(2)),
      priceCents: plan.priceCents,
      currency: plan.currency,
      entitlements: Object.fromEntries(plan.entitlements.map((item) => [item.key, item.value])),
    })),
    entitlements,
    limits: Object.entries(entitlements)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => ({ key, value })),
    packages: [],
    payments: payments.map((payment) => ({
      id: payment.id,
      date: payment.createdAt.toISOString(),
      title: payment.description,
      amount: Number((payment.amountCents / 100).toFixed(2)),
      status: paymentStatus(payment.status),
      provider: payment.provider,
      providerStatus: payment.providerStatus,
      test: payment.test,
      receiptAvailable: false,
    })),
    paymentProviderConfigured: isBillingProviderConfigured(),
    trial: { available: !priorPro && subscription.plan.code === 'FREE', days: PRO_TRIAL_DAYS },
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
  const entitlement = subscription.plan.entitlements.find((item: any) => item.key === key);
  if (!entitlement || entitlement.value !== true) {
    throw new AppError({
      code: 'ENTITLEMENT_REQUIRED',
      message: 'Функция недоступна на текущем тарифе',
      statusCode: 403,
      details: { entitlement: key },
    });
  }
}
