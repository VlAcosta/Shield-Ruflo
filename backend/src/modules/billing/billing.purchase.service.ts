import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { getPublicBillingCatalog, PUBLIC_PLAN_CODES, type PublicPlanCode } from './billing.service.js';

export type BillingInterval = 'monthly' | 'annual';

type PurchaseRequestInput = {
  organizationId: string;
  userId: string;
  planCode: PublicPlanCode;
  billingInterval: BillingInterval;
  idempotencyKey: string;
  returnUrl?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

function publicRequest(request: {
  id: string;
  planCode: string;
  billingInterval: string;
  quotedAmountCents: number;
  currency: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: request.id,
    planCode: request.planCode,
    billingInterval: request.billingInterval,
    quotedAmountCents: request.quotedAmountCents,
    quotedAmount: Number((request.quotedAmountCents / 100).toFixed(2)),
    currency: request.currency,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
  };
}

function salesNextAction(requestId: string) {
  return {
    type: 'SALES_CONTACT' as const,
    status: 'REQUEST_RECORDED' as const,
    url: `/chat?topic=business&billingRequest=${encodeURIComponent(requestId)}`,
    message: 'Заявка зафиксирована. Подписка не активирована и платёж не создан.',
  };
}

export function billingPurchaseOptions() {
  return {
    onlineCheckout: {
      available: false,
      provider: null,
      reasonCode: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    },
    salesAssisted: {
      available: true,
      mode: 'SALES_ASSISTED',
      paymentCreated: false,
      subscriptionActivated: false,
      supportedIntervals: ['monthly', 'annual'] as const,
    },
  };
}

function validateIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new AppError({
      code: 'IDEMPOTENCY_KEY_INVALID',
      message: 'Некорректный Idempotency-Key',
      statusCode: 400,
    });
  }
  return normalized;
}

export async function createSalesAssistedPurchaseRequest(app: FastifyInstance, input: PurchaseRequestInput) {
  if (!PUBLIC_PLAN_CODES.includes(input.planCode)) {
    throw new AppError({ code: 'BILLING_PLAN_NOT_FOUND', message: 'Тариф недоступен для подключения', statusCode: 404 });
  }

  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const existing = await app.prisma.billingPurchaseRequest.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.organizationId !== input.organizationId || existing.requestedByUserId !== input.userId) {
      throw new AppError({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'Idempotency-Key уже использован другим запросом',
        statusCode: 409,
      });
    }
    return {
      mode: 'SALES_ASSISTED' as const,
      paymentCreated: false,
      subscriptionActivated: false,
      deduplicated: true,
      request: publicRequest(existing),
      nextAction: salesNextAction(existing.id),
    };
  }

  const [catalog, user] = await Promise.all([
    getPublicBillingCatalog(app),
    app.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, phone: true },
    }),
  ]);
  const plan = catalog.find((item) => item.code === input.planCode);
  if (!plan) {
    throw new AppError({ code: 'BILLING_PLAN_NOT_FOUND', message: 'Тариф недоступен для подключения', statusCode: 404 });
  }

  const quotedAmountCents = input.billingInterval === 'annual'
    ? plan.annualPriceCents
    : plan.priceCents;

  const request = await app.prisma.$transaction(async (tx) => {
    // Reuse the project's proven PostgreSQL advisory-lock pattern: the lock is
    // transaction-scoped and the SELECT is executed through $queryRaw, not the
    // mutation-oriented $executeRaw API.
    const lockKey = `billing:purchase:${input.organizationId}`;
    await tx.$queryRaw<Array<{ acquired: number }>>`
      SELECT 1::int AS acquired
      FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)) AS advisory_lock
    `;

    const afterLock = await tx.billingPurchaseRequest.findUnique({ where: { idempotencyKey } });
    if (afterLock) return afterLock;

    const created = await tx.billingPurchaseRequest.create({
      data: {
        organizationId: input.organizationId,
        requestedByUserId: input.userId,
        planCode: input.planCode,
        billingInterval: input.billingInterval,
        quotedAmountCents,
        currency: plan.currency,
        idempotencyKey,
        contactEmail: user?.email ?? null,
        contactPhone: user?.phone ?? null,
        requestedReturnUrl: input.returnUrl ?? null,
        metadata: {
          source: 'pricing_checkout',
          onlineCheckoutAvailable: false,
          annualDiscountPercent: plan.annualDiscountPercent,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        action: 'billing.purchase_requested',
        entityType: 'billing_purchase_request',
        entityId: created.id,
        metadata: {
          planCode: input.planCode,
          billingInterval: input.billingInterval,
          quotedAmountCents,
          currency: plan.currency,
          paymentCreated: false,
          subscriptionActivated: false,
        },
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 2048) ?? null,
      },
    });

    return created;
  });

  return {
    mode: 'SALES_ASSISTED' as const,
    paymentCreated: false,
    subscriptionActivated: false,
    deduplicated: false,
    request: publicRequest(request),
    nextAction: salesNextAction(request.id),
  };
}

export async function listSalesAssistedPurchaseRequests(app: FastifyInstance, organizationId: string) {
  const requests = await app.prisma.billingPurchaseRequest.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return requests.map(publicRequest);
}
