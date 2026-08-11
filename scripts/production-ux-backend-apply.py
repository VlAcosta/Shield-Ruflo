from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'anchor not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


# Environment: production registry provider + official FNS NPD status service.
replace_once(
    'backend/src/config/env.ts',
    "    COMPANY_LOOKUP_PROVIDER: z.enum(['disabled', 'mock', 'webhook']).default('disabled'),\n    COMPANY_LOOKUP_WEBHOOK_URL: optionalUrl,\n    COMPANY_LOOKUP_WEBHOOK_TOKEN: z.string().default(''),\n    COMPANY_LOOKUP_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),",
    "    COMPANY_LOOKUP_PROVIDER: z.enum(['disabled', 'mock', 'webhook', 'dadata']).default('disabled'),\n    COMPANY_LOOKUP_WEBHOOK_URL: optionalUrl,\n    COMPANY_LOOKUP_WEBHOOK_TOKEN: z.string().default(''),\n    COMPANY_LOOKUP_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),\n    DADATA_API_KEY: z.string().trim().default(''),\n    DADATA_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(6_500),\n    FNS_NPD_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(120_000).default(65_000),",
)
replace_once(
    'backend/src/config/env.ts',
    "    if (value.COMPANY_LOOKUP_PROVIDER === 'webhook' && !value.COMPANY_LOOKUP_WEBHOOK_URL) {\n      ctx.addIssue({\n        code: 'custom',\n        path: ['COMPANY_LOOKUP_WEBHOOK_URL'],\n        message: 'COMPANY_LOOKUP_WEBHOOK_URL is required when COMPANY_LOOKUP_PROVIDER=webhook',\n      });\n    }",
    "    if (value.COMPANY_LOOKUP_PROVIDER === 'webhook' && !value.COMPANY_LOOKUP_WEBHOOK_URL) {\n      ctx.addIssue({\n        code: 'custom',\n        path: ['COMPANY_LOOKUP_WEBHOOK_URL'],\n        message: 'COMPANY_LOOKUP_WEBHOOK_URL is required when COMPANY_LOOKUP_PROVIDER=webhook',\n      });\n    }\n    if (value.COMPANY_LOOKUP_PROVIDER === 'dadata' && !value.DADATA_API_KEY) {\n      ctx.addIssue({ code: 'custom', path: ['DADATA_API_KEY'], message: 'DaData company lookup requires an API key' });\n    }",
)

# Example env should be deployable without exposing real secrets.
replace_once(
    'backend/.env.example',
    "# Company lookup. Keep disabled until a real provider exists.\nCOMPANY_LOOKUP_PROVIDER=disabled\nCOMPANY_LOOKUP_WEBHOOK_URL=\nCOMPANY_LOOKUP_WEBHOOK_TOKEN=\nCOMPANY_LOOKUP_WEBHOOK_TIMEOUT_MS=5000",
    "# Company lookup. DaData uses ЕГРЮЛ/ЕГРИП-derived registry data.\n# Self-employed (НПД) verification always uses the public FNS service.\nCOMPANY_LOOKUP_PROVIDER=dadata\nDADATA_API_KEY=CHANGE_ME\nDADATA_TIMEOUT_MS=6500\nFNS_NPD_TIMEOUT_MS=65000\nCOMPANY_LOOKUP_WEBHOOK_URL=\nCOMPANY_LOOKUP_WEBHOOK_TOKEN=\nCOMPANY_LOOKUP_WEBHOOK_TIMEOUT_MS=5000",
)

# Company domain supports self-employed as an explicit business identity.
replace_once(
    'backend/src/shared/domain/company.ts',
    "  const legalType = input.legalType === 'ip' || input.legalType === 'ul'\n    ? input.legalType\n    : inferLegalType(inn);",
    "  const legalType = ['ip', 'ul', 'smz'].includes(String(input.legalType || ''))\n    ? input.legalType\n    : inferLegalType(inn);",
)
replace_once(
    'backend/src/shared/domain/company.ts',
    "  if (legalType === 'ip' && inn && inn.length !== 12) {\n    throw new AppError({ code: 'INVALID_INN', message: 'Для ИП ИНН должен содержать 12 цифр', statusCode: 400 });\n  }",
    "  if (legalType === 'ip' && inn && inn.length !== 12) {\n    throw new AppError({ code: 'INVALID_INN', message: 'Для ИП ИНН должен содержать 12 цифр', statusCode: 400 });\n  }\n  if (legalType === 'smz' && inn && inn.length !== 12) {\n    throw new AppError({ code: 'INVALID_INN', message: 'Для самозанятого ИНН должен содержать 12 цифр', statusCode: 400 });\n  }",
)
replace_once(
    'backend/src/shared/domain/company.ts',
    "  if (legalType === 'ip' && kpp) {\n    throw new AppError({ code: 'INVALID_KPP', message: 'Для ИП КПП не используется', statusCode: 400 });\n  }",
    "  if ((legalType === 'ip' || legalType === 'smz') && kpp) {\n    throw new AppError({ code: 'INVALID_KPP', message: legalType === 'smz' ? 'Для самозанятого КПП не используется' : 'Для ИП КПП не используется', statusCode: 400 });\n  }",
)

# Registry service: evidence remains tenant/user-bound and now knows trusted providers.
replace_once(
    'backend/src/modules/company/company.service.ts',
    "import { secureHashEquals } from '../../shared/security/tokens.js';",
    "import { secureHashEquals } from '../../shared/security/tokens.js';\nimport { lookupDadataCompany, lookupFnsNpdStatus, type CompanyLookupKind } from './company-registry.providers.js';",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "  provider: 'mock' | 'webhook';",
    "  provider: 'mock' | 'webhook' | 'dadata' | 'fns_npd';",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "  provider: 'mock' | 'webhook',",
    "  provider: 'mock' | 'webhook' | 'dadata' | 'fns_npd',",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "): { source: string; provider: 'mock' | 'webhook' } | null {",
    "): { source: string; provider: 'mock' | 'webhook' | 'dadata' | 'fns_npd' } | null {",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "    if (payload.provider !== 'mock' && payload.provider !== 'webhook') return null;",
    "    if (!['mock', 'webhook', 'dadata', 'fns_npd'].includes(String(payload.provider || ''))) return null;",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "export async function lookupCompanyByInn(\n  inn: string,\n  context: CompanyLookupContext,\n): Promise<{ company: CompanyLookupResult; source: string; demo: boolean; lookupEvidence: string }> {\n  if (env.COMPANY_LOOKUP_PROVIDER === 'disabled') {",
    "export async function lookupCompanyByInn(\n  inn: string,\n  context: CompanyLookupContext,\n  kind: CompanyLookupKind = 'auto',\n): Promise<{ company: CompanyLookupResult; source: string; demo: boolean; lookupEvidence: string }> {\n  if (kind === 'smz') {\n    const company = await lookupFnsNpdStatus(inn);\n    const source = 'ФНС России · НПД';\n    return { company, source, demo: false, lookupEvidence: createCompanyLookupEvidence(company, source, 'fns_npd', context) };\n  }\n\n  if (env.COMPANY_LOOKUP_PROVIDER === 'disabled') {",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "  const controller = new AbortController();",
    "  if (env.COMPANY_LOOKUP_PROVIDER === 'dadata') {\n    const company = await lookupDadataCompany(inn, kind);\n    if (!company) {\n      throw new AppError({ code: 'COMPANY_NOT_FOUND', message: 'Организация или ИП с таким ИНН не найдены', statusCode: 404 });\n    }\n    const source = 'DaData · ЕГРЮЛ/ЕГРИП';\n    return { company, source, demo: false, lookupEvidence: createCompanyLookupEvidence(company, source, 'dadata', context) };\n  }\n\n  const controller = new AbortController();",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "      body: JSON.stringify({ inn }),",
    "      body: JSON.stringify({ inn, kind }),",
)
replace_once(
    'backend/src/modules/company/company.service.ts',
    "  const legalType = inferLegalType(nextInn) ?? (current.legalType === 'ul' || current.legalType === 'ip' ? current.legalType : null);",
    "  const legalType = (current.legalType === 'ul' || current.legalType === 'ip' || current.legalType === 'smz')\n    ? current.legalType\n    : inferLegalType(nextInn);",
)

# Onboarding accepts SMZ and treats FNS/DaData evidence as trusted registry evidence.
replace_once('backend/src/modules/onboarding/onboarding.schemas.ts', "const legalType = z.enum(['ul', 'ip']);", "const legalType = z.enum(['ul', 'ip', 'smz']);")
replace_once(
    'backend/src/modules/onboarding/onboarding.service.ts',
    "import { env } from '../../config/env.js';",
    "import { env } from '../../config/env.js';\nimport { ensureFreeSubscription } from '../billing/billing.service.js';",
)
replace_once(
    'backend/src/modules/onboarding/onboarding.service.ts',
    "  const registryTrusted = env.COMPANY_LOOKUP_PROVIDER === 'webhook' && verifiedEvidence?.provider === 'webhook';\n  const registrySource = registryTrusted\n    ? verifiedEvidence.source\n    : (verifiedEvidence?.provider === 'mock' ? 'demo' : 'manual');",
    "  const trustedProviders = new Set(['webhook', 'dadata', 'fns_npd']);\n  const registryTrusted = Boolean(verifiedEvidence && trustedProviders.has(verifiedEvidence.provider));\n  const registrySource = registryTrusted\n    ? verifiedEvidence!.source\n    : (verifiedEvidence?.provider === 'mock' ? 'demo' : 'manual');",
)
replace_once(
    'backend/src/modules/onboarding/onboarding.service.ts',
    "  const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.auth.userId }, include: publicUserInclude });",
    "  await ensureFreeSubscription(app, organizationId);\n\n  const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.auth.userId }, include: publicUserInclude });",
)

# Billing: the catalog becomes useful before payment integration through a one-time PRO trial.
write('backend/src/modules/billing/billing.service.ts', '''import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';

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

export async function getBillingSnapshot(app: FastifyInstance, organizationId: string) {
  const subscription = await ensureFreeSubscription(app, organizationId);
  const [plans, priorPro] = await Promise.all([
    app.prisma.plan.findMany({ where: { active: true }, include: { entitlements: true }, orderBy: { priceCents: 'asc' } }),
    app.prisma.subscription.findFirst({ where: { organizationId, plan: { code: 'PRO' } }, select: { id: true } }),
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
    payments: [],
    paymentProviderConfigured: false,
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
''')

replace_once(
    'backend/src/modules/billing/billing.routes.ts',
    "import { getBillingSnapshot } from './billing.service.js';",
    "import { getBillingSnapshot, startProTrial } from './billing.service.js';",
)
replace_once(
    'backend/src/modules/billing/billing.routes.ts',
    "  app.post('/billing/subscription/promo/validate',",
    "  app.post('/billing/subscription/trial', { preHandler: [app.authenticate, app.authorize('billing.manage')] }, async (request) => {\n    return startProTrial(app, orgId(request));\n  });\n\n  app.post('/billing/subscription/promo/validate',",
)

# Catalog price matches the existing product pricing shown by the frontend; payment remains disabled.
migration = ROOT / 'backend/prisma/migrations/20260811225000_production_ux_billing_recovery'
migration.mkdir(parents=True, exist_ok=True)
(migration / 'migration.sql').write_text('''-- Production UX recovery: make the PRO catalog truthful while checkout remains provider-gated.\nUPDATE "plans" SET "name" = 'Профессионал', "price_cents" = 499000, "updated_at" = CURRENT_TIMESTAMP WHERE "code" = 'PRO';\n''', encoding='utf-8')

print('production UX backend patch applied')
