import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { getBillingSnapshot } from './billing.service.js';

function orgId(request: FastifyRequest): string {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return request.auth.organizationId;
}

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/billing/plans', { preHandler: [app.authenticate, app.authorize('billing.view')] }, async () => ({
    plans: await app.prisma.plan.findMany({ where: { active: true }, include: { entitlements: true }, orderBy: { priceCents: 'asc' } }),
  }));

  app.get('/billing/subscription', { preHandler: [app.authenticate, app.authorize('billing.view')] }, async (request) => {
    return getBillingSnapshot(app, orgId(request));
  });

  app.get('/billing/entitlements', { preHandler: [app.authenticate] }, async (request) => {
    const snapshot = await getBillingSnapshot(app, orgId(request));
    return { entitlements: snapshot.entitlements, plan: snapshot.plan, subscription: snapshot.subscription };
  });

  app.patch('/billing/subscription/auto-renew', { preHandler: [app.authenticate, app.authorize('billing.manage')] }, async (request) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    const snapshot = await getBillingSnapshot(app, orgId(request));
    if (snapshot.subscription.provider === null && snapshot.plan.code !== 'FREE') {
      throw new AppError({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'Платёжный провайдер не настроен', statusCode: 503 });
    }
    const subscription = await app.prisma.subscription.update({
      where: { id: snapshot.subscription.id },
      data: { autoRenew: enabled },
    });
    return { plan: { ...snapshot.plan, autoRenew: subscription.autoRenew }, subscription };
  });

  app.post('/billing/subscription/promo/validate', { preHandler: [app.authenticate, app.authorize('billing.view')] }, async (request) => {
    const { code } = z.object({ code: z.string().trim().max(80) }).parse(request.body);
    return { valid: false, code: code.toUpperCase(), percent: 0, discount: 0, reason: 'PROMO_SYSTEM_NOT_CONFIGURED' };
  });

  app.post('/billing/subscription/checkout', { preHandler: [app.authenticate, app.authorize('billing.manage')] }, async () => {
    throw new AppError({
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      message: 'Онлайн-оплата пока недоступна: production payment provider не настроен',
      statusCode: 503,
      details: { status: 'payment_unavailable' },
    });
  });
};
