import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';

export async function ensureFreeSubscription(app: FastifyInstance, organizationId: string) {
  const existing = await app.prisma.subscription.findFirst({
    where: { organizationId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] } },
    include: { plan: { include: { entitlements: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  const freePlan = await app.prisma.plan.findFirst({ where: { code: 'FREE', active: true }, include: { entitlements: true } });
  if (!freePlan) {
    throw new AppError({ code: 'FREE_PLAN_NOT_CONFIGURED', message: 'Базовый тариф не настроен', statusCode: 503 });
  }

  return app.prisma.subscription.create({
    data: {
      organizationId,
      planId: freePlan.id,
      status: 'ACTIVE',
      provider: null,
      autoRenew: false,
    },
    include: { plan: { include: { entitlements: true } } },
  });
}

function entitlementMap(subscription: any): Record<string, unknown> {
  return Object.fromEntries((subscription.plan?.entitlements ?? []).map((item: any) => [item.key, item.value]));
}

export async function getBillingSnapshot(app: FastifyInstance, organizationId: string) {
  const subscription = await ensureFreeSubscription(app, organizationId);
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
    entitlements,
    limits: Object.entries(entitlements)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => ({ key, value })),
    packages: [],
    payments: [],
    paymentProviderConfigured: false,
  };
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
