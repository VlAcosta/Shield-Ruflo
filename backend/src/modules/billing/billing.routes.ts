import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { getBillingSnapshot, getPublicBillingCatalog, PUBLIC_PLAN_CODES, startProTrial } from './billing.service.js';
import {
  billingPurchaseOptions,
  createSalesAssistedPurchaseRequest,
  listSalesAssistedPurchaseRequests,
} from './billing.purchase.service.js';

function orgId(request: FastifyRequest): string {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return request.auth.organizationId;
}

function userId(request: FastifyRequest): string {
  if (!request.auth?.userId) {
    throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  }
  return request.auth.userId;
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Для коммерческого запроса требуется Idempotency-Key',
      statusCode: 400,
    });
  }
  return value;
}

const checkoutSchema = z.object({
  planId: z.enum(PUBLIC_PLAN_CODES),
  billing: z.enum(['monthly', 'annual']).default('monthly'),
  // Client amount/currency are intentionally not trusted. They are accepted
  // only for backwards-compatible payload parsing and ignored for the quote.
  amount: z.number().finite().nonnegative().optional(),
  currency: z.string().trim().max(3).optional(),
  returnUrl: z.string().url().max(2048).optional(),
});

export const billingRoutes: FastifyPluginAsync = async (app) => {
  // Safe public catalog: prices and product limits only, never subscription or tenant data.
  app.get('/billing/catalog', async () => ({ plans: await getPublicBillingCatalog(app) }));
  app.get('/billing/purchase-options', async () => billingPurchaseOptions());

  app.get('/billing/plans', { preHandler: [app.authenticate, app.authorize('billing.view')] }, async () => ({
    plans: await getPublicBillingCatalog(app),
  }));

  app.get('/billing/subscription', { preHandler: [app.authenticate, app.authorize('billing.view')] }, async (request) => {
    return getBillingSnapshot(app, orgId(request));
  });

  app.get('/billing/usage', { preHandler: [app.authenticate, app.authorize('billing.view')] }, async (request) => {
    const snapshot = await getBillingSnapshot(app, orgId(request));
    return { plan: snapshot.plan, usage: snapshot.usage };
  });

  app.get('/billing/entitlements', { preHandler: [app.authenticate] }, async (request) => {
    const snapshot = await getBillingSnapshot(app, orgId(request));
    return {
      entitlements: snapshot.entitlements,
      plan: snapshot.plan,
      subscription: snapshot.subscription,
      usage: snapshot.usage,
    };
  });

  app.get('/billing/purchase-requests', {
    preHandler: [app.authenticate, app.authorize('billing.view')],
  }, async (request) => ({
    requests: await listSalesAssistedPurchaseRequests(app, orgId(request)),
  }));

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

  app.post('/billing/subscription/trial', { preHandler: [app.authenticate, app.authorize('billing.manage')] }, async (request) => {
    return startProTrial(app, orgId(request));
  });

  app.post('/billing/subscription/promo/validate', { preHandler: [app.authenticate, app.authorize('billing.view')] }, async (request) => {
    const { code } = z.object({ code: z.string().trim().max(80) }).parse(request.body);
    return { valid: false, code: code.toUpperCase(), percent: 0, discount: 0, reason: 'PROMO_SYSTEM_NOT_CONFIGURED' };
  });

  app.post('/billing/subscription/checkout', {
    preHandler: [app.authenticate, app.authorize('billing.manage')],
  }, async (request, reply) => {
    const input = checkoutSchema.parse(request.body);
    const result = await createSalesAssistedPurchaseRequest(app, {
      organizationId: orgId(request),
      userId: userId(request),
      planCode: input.planId,
      billingInterval: input.billing,
      idempotencyKey: idempotencyKey(request),
      ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
      ipAddress: request.ip,
      userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
    });

    // 202 is deliberate: the commercial request is accepted, but there is no
    // payment transaction and no subscription activation at this boundary.
    return reply.code(202).send(result);
  });
};
