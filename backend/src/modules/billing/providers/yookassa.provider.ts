import { z } from 'zod';
import { env } from '../../../config/env.js';
import { AppError } from '../../../core/errors/app-error.js';
import type { BillingProvider, CreateProviderPaymentInput, ProviderPayment } from './billing-provider.js';

const providerPaymentSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  paid: z.boolean().default(false),
  test: z.boolean().default(false),
  amount: z.object({
    value: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    currency: z.string().min(3).max(3),
  }),
  confirmation: z.object({
    confirmation_url: z.string().url().optional(),
  }).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

function toProviderPayment(payload: unknown): ProviderPayment {
  const payment = providerPaymentSchema.parse(payload);
  return {
    id: payment.id,
    status: payment.status,
    paid: payment.paid,
    amountCents: Math.round(Number(payment.amount.value) * 100),
    currency: payment.amount.currency,
    confirmationUrl: payment.confirmation?.confirmation_url ?? null,
    test: payment.test,
    metadata: Object.fromEntries(Object.entries(payment.metadata ?? {}).map(([key, value]) => [key, String(value)])),
  };
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`, 'utf8').toString('base64')}`;
}

async function yookassaRequest(path: string, init: RequestInit): Promise<ProviderPayment> {
  let response: Response;
  try {
    response = await fetch(`https://api.yookassa.ru/v3${path}`, {
      ...init,
      signal: AbortSignal.timeout(env.YOOKASSA_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        Authorization: basicAuthHeader(),
        ...init.headers,
      },
    });
  } catch (error) {
    throw new AppError({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      message: 'Платёжный провайдер временно недоступен',
      statusCode: 502,
      details: { provider: 'yookassa', cause: error instanceof Error ? error.name : 'network_error' },
    });
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const providerCode = typeof body === 'object' && body && 'code' in body ? String(body.code) : `HTTP_${response.status}`;
    throw new AppError({
      code: 'PAYMENT_PROVIDER_REJECTED',
      message: 'ЮKassa отклонила запрос на оплату',
      statusCode: response.status === 401 ? 503 : 502,
      details: { provider: 'yookassa', providerCode, httpStatus: response.status },
    });
  }

  try {
    return toProviderPayment(body);
  } catch {
    throw new AppError({
      code: 'PAYMENT_PROVIDER_INVALID_RESPONSE',
      message: 'Платёжный провайдер вернул некорректный ответ',
      statusCode: 502,
      details: { provider: 'yookassa' },
    });
  }
}

function amountValue(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

export const yookassaProvider: BillingProvider = {
  id: 'yookassa',
  get configured() {
    return env.BILLING_PROVIDER === 'yookassa' && Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY && env.YOOKASSA_RETURN_URL);
  },

  async createPayment(input: CreateProviderPaymentInput) {
    const receipt = env.YOOKASSA_RECEIPT_ENABLED
      ? {
          customer: {
            ...(input.customerEmail ? { email: input.customerEmail } : {}),
            ...(!input.customerEmail && input.customerPhone ? { phone: input.customerPhone } : {}),
          },
          items: [{
            description: input.description.slice(0, 128),
            quantity: '1.00',
            amount: { value: amountValue(input.amountCents), currency: input.currency },
            vat_code: env.YOOKASSA_VAT_CODE,
            payment_subject: 'service',
            payment_mode: 'full_payment',
          }],
        }
      : undefined;

    if (env.YOOKASSA_RECEIPT_ENABLED && !input.customerEmail && !input.customerPhone) {
      throw new AppError({
        code: 'PAYMENT_RECEIPT_CONTACT_REQUIRED',
        message: 'Для формирования чека нужен email или телефон плательщика',
        statusCode: 422,
      });
    }

    return yookassaRequest('/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        amount: { value: amountValue(input.amountCents), currency: input.currency },
        capture: true,
        confirmation: { type: 'redirect', return_url: env.YOOKASSA_RETURN_URL },
        description: input.description.slice(0, 128),
        metadata: {
          local_payment_id: input.localPaymentId,
          organization_id: input.organizationId,
          ...input.metadata,
        },
        ...(receipt ? { receipt } : {}),
      }),
    });
  },

  async getPayment(providerPaymentId: string) {
    return yookassaRequest(`/payments/${encodeURIComponent(providerPaymentId)}`, { method: 'GET' });
  },
};
