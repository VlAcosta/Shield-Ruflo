import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { constructorSelectionSchema, quoteConstructor } from './billing.catalog.js';
import type { ProviderPayment } from './providers/billing-provider.js';
import { getBillingProvider } from './providers/index.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] as const;
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export const checkoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan'), planCode: z.literal('PRO') }),
  z.object({ kind: z.literal('constructor'), selection: constructorSelectionSchema }),
]);

export const yookassaWebhookSchema = z.object({
  type: z.literal('notification').optional(),
  event: z.enum(['payment.succeeded', 'payment.canceled', 'payment.waiting_for_capture']),
  object: z.object({
    id: z.string().min(1),
    status: z.string().min(1).optional(),
  }).passthrough(),
}).passthrough();

type CheckoutInput = z.infer<typeof checkoutSchema>;

type CheckoutQuote = {
  kind: 'plan' | 'constructor';
  amountCents: number;
  currency: 'RUB';
  description: string;
  planId: string | null;
  payload: Record<string, unknown>;
};

function providerState(payment: ProviderPayment): 'PENDING' | 'SUCCEEDED' | 'CANCELED' | 'FAILED' {
  if (payment.status === 'succeeded' && payment.paid) return 'SUCCEEDED';
  if (payment.status === 'canceled') return 'CANCELED';
  if (payment.status === 'failed') return 'FAILED';
  return 'PENDING';
}

function publicPayment(payment: {
  id: string;
  status: string;
  providerStatus: string | null;
  amountCents: number;
  currency: string;
  confirmationUrl: string | null;
  test: boolean;
  createdAt: Date;
  description: string;
}) {
  return {
    ok: true,
    paymentId: payment.id,
    status: payment.status.toLowerCase(),
    providerStatus: payment.providerStatus,
    amount: Number((payment.amountCents / 100).toFixed(2)),
    amountCents: payment.amountCents,
    currency: payment.currency,
    redirectUrl: payment.confirmationUrl,
    test: payment.test,
    createdAt: payment.createdAt.toISOString(),
    description: payment.description,
  };
}

async function buildQuote(app: FastifyInstance, input: CheckoutInput): Promise<CheckoutQuote> {
  if (input.kind === 'plan') {
    const plan = await app.prisma.plan.findFirst({ where: { code: input.planCode, active: true } });
    if (!plan || plan.priceCents <= 0) {
      throw new AppError({ code: 'PLAN_NOT_AVAILABLE', message: 'Выбранный тариф недоступен для оплаты', statusCode: 409 });
    }
    if (plan.currency !== 'RUB') {
      throw new AppError({ code: 'PLAN_CURRENCY_UNSUPPORTED', message: 'Валюта тарифа пока не поддерживается', statusCode: 409 });
    }
    return {
      kind: 'plan',
      amountCents: plan.priceCents,
      currency: 'RUB',
      description: `Бизнес Щит · ${plan.name} · 1 месяц`,
      planId: plan.id,
      payload: { kind: 'plan', planCode: plan.code },
    };
  }

  const quote = quoteConstructor(input.selection);
  return {
    kind: 'constructor',
    amountCents: quote.amountCents,
    currency: quote.currency,
    description: 'Бизнес Щит · индивидуальный тариф · 1 месяц',
    planId: null,
    payload: { kind: 'constructor', quote },
  };
}

function customPlanCode(organizationId: string) {
  return `CUSTOM_${organizationId.replace(/-/g, '').toUpperCase()}`;
}

async function ensureConstructorPlan(tx: FastifyInstance['prisma'], organizationId: string, payment: { amountCents: number; checkoutPayload: unknown }) {
  const payload = z.object({
    kind: z.literal('constructor'),
    quote: z.object({
      amountCents: z.number().int().positive(),
      currency: z.literal('RUB'),
      entitlements: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
    }).passthrough(),
  }).parse(payment.checkoutPayload);

  if (payload.quote.amountCents !== payment.amountCents) {
    throw new AppError({ code: 'PAYMENT_QUOTE_MISMATCH', message: 'Сохранённая конфигурация тарифа не совпадает с платежом', statusCode: 409 });
  }

  const plan = await tx.plan.upsert({
    where: { code: customPlanCode(organizationId) },
    create: {
      code: customPlanCode(organizationId),
      name: 'Индивидуальный',
      priceCents: payment.amountCents,
      currency: 'RUB',
      active: false,
    },
    update: {
      name: 'Индивидуальный',
      priceCents: payment.amountCents,
      currency: 'RUB',
      active: false,
    },
  });

  await tx.entitlement.deleteMany({ where: { planId: plan.id } });
  await tx.entitlement.createMany({
    data: Object.entries(payload.quote.entitlements).map(([key, value]) => ({ planId: plan.id, key, value })),
  });
  return plan;
}

export async function activateSucceededPayment(app: FastifyInstance, localPaymentId: string, providerPayment: ProviderPayment) {
  return app.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing:payment:${localPaymentId}`}, 0))`;
    const payment = await tx.payment.findUnique({ where: { id: localPaymentId } });
    if (!payment) throw new AppError({ code: 'PAYMENT_NOT_FOUND', message: 'Платёж не найден', statusCode: 404 });

    if (payment.providerPaymentId && payment.providerPaymentId !== providerPayment.id) {
      throw new AppError({ code: 'PAYMENT_PROVIDER_ID_MISMATCH', message: 'Провайдер вернул другой идентификатор платежа', statusCode: 409 });
    }
    if (payment.amountCents !== providerPayment.amountCents || payment.currency !== providerPayment.currency) {
      throw new AppError({ code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Сумма подтверждённого платежа не совпадает с заказом', statusCode: 409 });
    }
    if (!(providerPayment.status === 'succeeded' && providerPayment.paid)) {
      throw new AppError({ code: 'PAYMENT_NOT_SUCCEEDED', message: 'Платёж ещё не подтверждён', statusCode: 409 });
    }
    if (payment.status === 'SUCCEEDED' && payment.subscriptionId) return payment;

    let plan = payment.planId ? await tx.plan.findUnique({ where: { id: payment.planId } }) : null;
    if (payment.checkoutKind === 'CONSTRUCTOR') {
      plan = await ensureConstructorPlan(tx as unknown as FastifyInstance['prisma'], payment.organizationId, payment);
    }
    if (!plan) throw new AppError({ code: 'PAYMENT_PLAN_NOT_FOUND', message: 'Тариф платежа не найден', statusCode: 409 });

    await tx.subscription.updateMany({
      where: { organizationId: payment.organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
      data: { status: 'CANCELED', autoRenew: false },
    });

    const now = new Date();
    const subscription = await tx.subscription.create({
      data: {
        organizationId: payment.organizationId,
        planId: plan.id,
        status: 'ACTIVE',
        provider: payment.provider,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + BILLING_PERIOD_MS),
        autoRenew: false,
      },
    });

    return tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCEEDED',
        providerStatus: providerPayment.status,
        providerPaymentId: providerPayment.id,
        providerMetadata: providerPayment.metadata,
        confirmationUrl: providerPayment.confirmationUrl,
        test: providerPayment.test,
        paidAt: now,
        canceledAt: null,
        planId: plan.id,
        subscriptionId: subscription.id,
      },
    });
  });
}

export async function reconcileProviderPayment(app: FastifyInstance, localPaymentId: string, providerPayment: ProviderPayment) {
  const payment = await app.prisma.payment.findUnique({ where: { id: localPaymentId } });
  if (!payment) throw new AppError({ code: 'PAYMENT_NOT_FOUND', message: 'Платёж не найден', statusCode: 404 });
  if (payment.amountCents !== providerPayment.amountCents || payment.currency !== providerPayment.currency) {
    throw new AppError({ code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Сумма платежа у провайдера не совпадает с заказом', statusCode: 409 });
  }

  if (providerPayment.status === 'succeeded' && providerPayment.paid) {
    return activateSucceededPayment(app, payment.id, providerPayment);
  }

  const status = providerState(providerPayment);
  return app.prisma.payment.update({
    where: { id: payment.id },
    data: {
      status,
      providerStatus: providerPayment.status,
      providerPaymentId: providerPayment.id,
      providerMetadata: providerPayment.metadata,
      confirmationUrl: providerPayment.confirmationUrl,
      test: providerPayment.test,
      canceledAt: status === 'CANCELED' ? new Date() : null,
    },
  });
}

async function createOrLoadLocalPayment(app: FastifyInstance, organizationId: string, idempotencyKey: string, providerId: string, input: CheckoutInput) {
  return app.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing:checkout:${idempotencyKey}`}, 0))`;
    const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.organizationId !== organizationId) {
        throw new AppError({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'Ключ повторного запроса уже использован', statusCode: 409 });
      }
      return existing;
    }

    const quote = await buildQuote(app, input);
    return tx.payment.create({
      data: {
        organizationId,
        planId: quote.planId,
        provider: providerId,
        idempotencyKey,
        checkoutKind: quote.kind === 'plan' ? 'PLAN' : 'CONSTRUCTOR',
        status: 'CREATED',
        amountCents: quote.amountCents,
        currency: quote.currency,
        description: quote.description,
        checkoutPayload: quote.payload,
      },
    });
  });
}

export async function startBillingCheckout(app: FastifyInstance, args: {
  organizationId: string;
  userId: string | null;
  idempotencyKey: string;
  body: unknown;
}) {
  // Resolve the provider before validating checkout input so disabled billing keeps a truthful 503 contract.
  const provider = getBillingProvider();
  const idempotencyKey = z.string().trim().min(8).max(160).parse(args.idempotencyKey);
  const input = checkoutSchema.parse(args.body);
  const local = await createOrLoadLocalPayment(app, args.organizationId, idempotencyKey, provider.id, input);

  if (local.provider !== provider.id) {
    throw new AppError({ code: 'PAYMENT_PROVIDER_CONFLICT', message: 'Платёж был создан через другого провайдера', statusCode: 409 });
  }

  if (local.status === 'SUCCEEDED') return publicPayment(local);

  if (local.providerPaymentId) {
    const verified = await provider.getPayment(local.providerPaymentId);
    const reconciled = await reconcileProviderPayment(app, local.id, verified);
    return publicPayment(reconciled);
  }

  const user = args.userId
    ? await app.prisma.user.findUnique({ where: { id: args.userId }, select: { phone: true, email: true } })
    : null;

  const providerPayment = await provider.createPayment({
    idempotencyKey,
    localPaymentId: local.id,
    organizationId: args.organizationId,
    amountCents: local.amountCents,
    currency: 'RUB',
    description: local.description,
    customerPhone: user?.phone ?? null,
    customerEmail: user?.email ?? null,
    metadata: { checkout_kind: local.checkoutKind.toLowerCase() },
  });

  const reconciled = await reconcileProviderPayment(app, local.id, providerPayment);
  return publicPayment(reconciled);
}

export async function getPaymentForOrganization(app: FastifyInstance, organizationId: string, paymentId: string, { refresh = false } = {}) {
  const payment = await app.prisma.payment.findFirst({ where: { id: paymentId, organizationId } });
  if (!payment) throw new AppError({ code: 'PAYMENT_NOT_FOUND', message: 'Платёж не найден', statusCode: 404 });

  if (refresh && payment.providerPaymentId && payment.status !== 'SUCCEEDED' && payment.status !== 'CANCELED') {
    const provider = getBillingProvider();
    if (provider.id === payment.provider) {
      const verified = await provider.getPayment(payment.providerPaymentId);
      return publicPayment(await reconcileProviderPayment(app, payment.id, verified));
    }
  }
  return publicPayment(payment);
}

export async function processYooKassaWebhook(app: FastifyInstance, body: unknown) {
  const notification = yookassaWebhookSchema.parse(body);
  const provider = getBillingProvider();
  if (provider.id !== 'yookassa') {
    throw new AppError({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'ЮKassa не активирована', statusCode: 503 });
  }

  const providerObjectId = notification.object.id;
  const eventKey = `yookassa:${createHash('sha256').update(`${notification.event}:${providerObjectId}`).digest('hex')}`;
  const event = await app.prisma.billingWebhookEvent.upsert({
    where: { eventKey },
    create: {
      provider: 'yookassa',
      eventKey,
      eventType: notification.event,
      providerObjectId,
      payload: notification,
    },
    update: {},
  });
  if (event.processedAt) return { ok: true, duplicate: true };

  let verified: ProviderPayment;
  try {
    verified = await provider.getPayment(providerObjectId);
  } catch (error) {
    await app.prisma.billingWebhookEvent.update({
      where: { id: event.id },
      data: { errorCode: 'PROVIDER_VERIFICATION_FAILED' },
    });
    throw error;
  }

  let local = await app.prisma.payment.findUnique({
    where: { provider_providerPaymentId: { provider: 'yookassa', providerPaymentId: providerObjectId } },
  });

  if (!local && verified.metadata.local_payment_id) {
    local = await app.prisma.payment.findFirst({
      where: { id: verified.metadata.local_payment_id, provider: 'yookassa' },
    });
    if (local && !local.providerPaymentId) {
      local = await app.prisma.payment.update({ where: { id: local.id }, data: { providerPaymentId: providerObjectId } });
    }
  }

  if (!local) {
    await app.prisma.billingWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), errorCode: 'LOCAL_PAYMENT_NOT_FOUND' },
    });
    return { ok: true, ignored: true };
  }

  await reconcileProviderPayment(app, local.id, verified);
  await app.prisma.billingWebhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), errorCode: null },
  });
  return { ok: true };
}

export async function quoteBillingConstructor(body: unknown) {
  return quoteConstructor(constructorSelectionSchema.parse(body));
}
