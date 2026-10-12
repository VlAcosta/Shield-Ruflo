import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { getPublicBillingCatalog, PUBLIC_PLAN_CODES, type PublicPlanCode } from './billing.service.js';

type BillingInterval = 'monthly' | 'annual';

type YooKassaPayment = {
  id: string;
  status: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  confirmation?: { type?: string; confirmation_url?: string };
  metadata?: Record<string, unknown>;
  payment_method?: { id?: string; saved?: boolean };
};

type CheckoutInput = {
  organizationId: string;
  userId: string;
  planCode: PublicPlanCode;
  billingInterval: BillingInterval;
  idempotencyKey: string;
  returnUrl?: string;
  ipAddress?: string;
  userAgent?: string;
};

export function yooKassaConfigured(): boolean {
  return env.PAYMENT_PROVIDER === 'yookassa'
    && Boolean(env.YOOKASSA_SHOP_ID)
    && Boolean(env.YOOKASSA_SECRET_KEY)
    && Boolean(env.YOOKASSA_RETURN_URL);
}

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString('base64');
}

async function yooFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.YOOKASSA_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: basicAuth(),
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let body: unknown = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 1000) }; }
    if (!response.ok) {
      throw new AppError({
        code: `YOOKASSA_HTTP_${response.status}`,
        message: 'Платёжный провайдер временно недоступен',
        statusCode: response.status === 429 || response.status >= 500 ? 503 : 502,
        details: { provider: 'yookassa', status: response.status },
      });
    }
    return body as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: 'YOOKASSA_REQUEST_FAILED',
      message: 'Не удалось связаться с платёжным провайдером',
      statusCode: 503,
      details: { provider: 'yookassa' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new AppError({ code: 'IDEMPOTENCY_KEY_INVALID', message: 'Некорректный Idempotency-Key', statusCode: 400 });
  }
  return normalized;
}

function amountValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function periodEnd(from: Date, interval: BillingInterval): Date {
  const value = new Date(from);
  if (interval === 'annual') value.setUTCFullYear(value.getUTCFullYear() + 1);
  else value.setUTCMonth(value.getUTCMonth() + 1);
  return value;
}

export async function createYooKassaCheckout(app: FastifyInstance, input: CheckoutInput) {
  if (!yooKassaConfigured()) {
    throw new AppError({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'Платёжный провайдер не настроен', statusCode: 503 });
  }
  if (!PUBLIC_PLAN_CODES.includes(input.planCode)) {
    throw new AppError({ code: 'BILLING_PLAN_NOT_FOUND', message: 'Тариф недоступен для подключения', statusCode: 404 });
  }

  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const existing = await app.prisma.billingPurchaseRequest.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.organizationId !== input.organizationId || existing.requestedByUserId !== input.userId
      || existing.planCode !== input.planCode || existing.billingInterval !== input.billingInterval) {
      throw new AppError({ code: 'IDEMPOTENCY_PAYLOAD_CONFLICT', message: 'Idempotency-Key уже использован с другими параметрами', statusCode: 409 });
    }
    if (existing.confirmationUrl) {
      return {
        mode: 'ONLINE_CHECKOUT' as const,
        provider: 'yookassa' as const,
        paymentCreated: true,
        subscriptionActivated: existing.status === 'COMPLETED',
        deduplicated: true,
        request: {
          id: existing.id,
          status: existing.status,
          providerStatus: existing.providerStatus,
          confirmationUrl: existing.confirmationUrl,
          quotedAmountCents: existing.quotedAmountCents,
          currency: existing.currency,
        },
        nextAction: { type: 'REDIRECT' as const, url: existing.confirmationUrl },
      };
    }
  }

  const [catalog, user] = await Promise.all([
    getPublicBillingCatalog(app),
    app.prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, phone: true } }),
  ]);
  const plan = catalog.find((item) => item.code === input.planCode);
  if (!plan) throw new AppError({ code: 'BILLING_PLAN_NOT_FOUND', message: 'Тариф недоступен для подключения', statusCode: 404 });

  const quotedAmountCents = input.billingInterval === 'annual' ? plan.annualPriceCents : plan.priceCents;
  const purchase = existing ?? await app.prisma.billingPurchaseRequest.create({
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
      provider: 'yookassa',
      providerStatus: 'creating',
      metadata: {
        source: 'pricing_checkout',
        onlineCheckoutAvailable: true,
        annualDiscountPercent: plan.annualDiscountPercent,
      },
    },
  });

  const returnUrl = input.returnUrl && input.returnUrl.startsWith('https://')
    ? input.returnUrl
    : env.YOOKASSA_RETURN_URL;

  const payment = await yooFetch<YooKassaPayment>('/payments', {
    method: 'POST',
    headers: { 'Idempotence-Key': idempotencyKey },
    body: JSON.stringify({
      amount: { value: amountValue(quotedAmountCents), currency: plan.currency },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description: `Business Shield · ${plan.name} · ${input.billingInterval === 'annual' ? 'год' : 'месяц'}`,
      metadata: {
        purchaseRequestId: purchase.id,
        organizationId: input.organizationId,
        planCode: input.planCode,
        billingInterval: input.billingInterval,
      },
    }),
  });

  const confirmationUrl = String(payment.confirmation?.confirmation_url || '').trim();
  if (!payment.id || !confirmationUrl) {
    throw new AppError({ code: 'YOOKASSA_INVALID_PAYMENT_RESPONSE', message: 'Платёжный провайдер не вернул ссылку на оплату', statusCode: 502 });
  }

  const updated = await app.prisma.billingPurchaseRequest.update({
    where: { id: purchase.id },
    data: {
      externalPaymentId: payment.id,
      providerStatus: payment.status || 'pending',
      confirmationUrl,
    },
  });

  await app.prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.userId,
      action: 'billing.payment_created',
      entityType: 'billing_purchase_request',
      entityId: updated.id,
      metadata: {
        provider: 'yookassa',
        externalPaymentId: payment.id,
        planCode: input.planCode,
        billingInterval: input.billingInterval,
        quotedAmountCents,
        currency: plan.currency,
      },
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 2048) ?? null,
    },
  }).catch(() => null);

  return {
    mode: 'ONLINE_CHECKOUT' as const,
    provider: 'yookassa' as const,
    paymentCreated: true,
    subscriptionActivated: false,
    deduplicated: false,
    request: {
      id: updated.id,
      status: updated.status,
      providerStatus: updated.providerStatus,
      confirmationUrl,
      quotedAmountCents,
      currency: plan.currency,
    },
    nextAction: { type: 'REDIRECT' as const, url: confirmationUrl },
  };
}

export async function getYooKassaPayment(paymentId: string) {
  if (!yooKassaConfigured()) {
    throw new AppError({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'Платёжный провайдер не настроен', statusCode: 503 });
  }
  return yooFetch<YooKassaPayment>(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
}

export async function processYooKassaNotification(app: FastifyInstance, input: { event?: string; object?: { id?: string } }) {
  if (!yooKassaConfigured()) {
    throw new AppError({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'Платёжный провайдер не настроен', statusCode: 503 });
  }

  const paymentId = String(input.object?.id || '').trim();
  if (!paymentId) throw new AppError({ code: 'YOOKASSA_NOTIFICATION_INVALID', message: 'Некорректное уведомление ЮKassa', statusCode: 400 });

  const payment = await getYooKassaPayment(paymentId);
  const purchaseId = String(payment.metadata?.purchaseRequestId || '').trim();
  if (!purchaseId) throw new AppError({ code: 'YOOKASSA_PAYMENT_METADATA_INVALID', message: 'Платёж не связан с Business Shield', statusCode: 409 });

  const purchase = await app.prisma.billingPurchaseRequest.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.externalPaymentId !== payment.id || purchase.provider !== 'yookassa') {
    throw new AppError({ code: 'YOOKASSA_PAYMENT_NOT_FOUND', message: 'Платёж Business Shield не найден', statusCode: 404 });
  }

  const amountCents = Math.round(Number(payment.amount?.value || 0) * 100);
  const currency = String(payment.amount?.currency || '').toUpperCase();
  if (amountCents !== purchase.quotedAmountCents || currency !== purchase.currency.toUpperCase()) {
    throw new AppError({ code: 'YOOKASSA_PAYMENT_AMOUNT_MISMATCH', message: 'Сумма платежа не совпадает с заказом', statusCode: 409 });
  }

  if (payment.status !== 'succeeded' || payment.paid !== true) {
    await app.prisma.billingPurchaseRequest.update({
      where: { id: purchase.id },
      data: { providerStatus: payment.status || 'unknown' },
    });
    return { accepted: true, activated: false, status: payment.status || 'unknown' };
  }

  if (purchase.status === 'COMPLETED') {
    return { accepted: true, activated: true, deduplicated: true };
  }

  const now = new Date();
  await app.prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ acquired: number }>>`
      SELECT 1::int AS acquired
      FROM (SELECT pg_advisory_xact_lock(hashtext(${`billing:yookassa:${purchase.id}`}), 0)) AS advisory_lock
    `;

    const current = await tx.billingPurchaseRequest.findUnique({ where: { id: purchase.id } });
    if (!current || current.status === 'COMPLETED') return;

    const plan = await tx.plan.findFirst({ where: { code: current.planCode, active: true } });
    if (!plan) throw new AppError({ code: 'BILLING_PLAN_NOT_FOUND', message: 'Оплаченный тариф больше недоступен', statusCode: 409 });

    await tx.subscription.updateMany({
      where: { organizationId: current.organizationId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] } },
      data: { status: 'CANCELED', autoRenew: false },
    });

    await tx.subscription.create({
      data: {
        organizationId: current.organizationId,
        planId: plan.id,
        status: 'ACTIVE',
        provider: 'yookassa',
        externalSubscriptionId: payment.id,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd(now, current.billingInterval as BillingInterval),
        autoRenew: false,
      },
    });

    await tx.billingPurchaseRequest.update({
      where: { id: current.id },
      data: {
        status: 'COMPLETED',
        providerStatus: payment.status,
        paidAt: now,
        completedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: current.organizationId,
        action: 'billing.payment_succeeded',
        entityType: 'billing_purchase_request',
        entityId: current.id,
        metadata: {
          provider: 'yookassa',
          externalPaymentId: payment.id,
          planCode: current.planCode,
          billingInterval: current.billingInterval,
          amountCents: current.quotedAmountCents,
          currency: current.currency,
        },
      },
    });
  });

  return { accepted: true, activated: true, deduplicated: false };
}
