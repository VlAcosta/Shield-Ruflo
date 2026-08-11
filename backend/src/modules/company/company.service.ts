import { createHmac } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import {
  companyLookupResultSchema,
  companyLookupWebhookResponseSchema,
  updateCompanyProfileSchema,
} from './company.schemas.js';
import { secureHashEquals } from '../../shared/security/tokens.js';
import { lookupDadataCompany, lookupFnsNpdStatus, type CompanyLookupKind } from './company-registry.providers.js';
import {
  formatRegistrationDate,
  inferLegalType,
  parseRegistrationDate,
  validateCompanyIdentifiers,
} from '../../shared/domain/company.js';

export type CompanyLookupResult = z.infer<typeof companyLookupResultSchema>;

type LookupEvidencePayload = {
  version: 1;
  expiresAt: number;
  source: string;
  provider: 'mock' | 'webhook' | 'dadata' | 'fns_npd';
  organizationId: string;
  userId: string;
  company: CompanyLookupResult;
};

export type CompanyLookupContext = {
  organizationId: string;
  userId: string;
};

const LOOKUP_EVIDENCE_TTL_MS = 10 * 60 * 1000;

function evidenceSignature(encodedPayload: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(`company-lookup:${encodedPayload}`, 'utf8').digest('hex');
}

function evidenceCompany(company: CompanyLookupResult): CompanyLookupResult {
  return {
    type: company.type,
    title: company.title,
    inn: company.inn,
    ...(company.kpp !== undefined ? { kpp: company.kpp } : {}),
    ...(company.ogrn !== undefined ? { ogrn: company.ogrn } : {}),
    ...(company.address !== undefined ? { address: company.address } : {}),
    ...(company.status !== undefined ? { status: company.status } : {}),
    ...(company.registrationDate !== undefined ? { registrationDate: company.registrationDate } : {}),
  };
}

export function createCompanyLookupEvidence(
  company: CompanyLookupResult,
  source: string,
  provider: 'mock' | 'webhook' | 'dadata' | 'fns_npd',
  context: CompanyLookupContext,
  now = Date.now(),
): string {
  const payload: LookupEvidencePayload = {
    version: 1,
    expiresAt: now + LOOKUP_EVIDENCE_TTL_MS,
    source,
    provider,
    organizationId: context.organizationId,
    userId: context.userId,
    company: evidenceCompany(company),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${evidenceSignature(encodedPayload)}`;
}

export function verifyCompanyLookupEvidence(
  evidence: string | undefined,
  expectedCompany: CompanyLookupResult,
  context: CompanyLookupContext,
  now = Date.now(),
): { source: string; provider: 'mock' | 'webhook' | 'dadata' | 'fns_npd' } | null {
  if (!evidence) return null;
  const [encodedPayload, suppliedSignature, ...rest] = evidence.split('.');
  if (!encodedPayload || !suppliedSignature || rest.length > 0) return null;
  if (!secureHashEquals(evidenceSignature(encodedPayload), suppliedSignature)) return null;

  try {
    const rawPayload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!rawPayload || typeof rawPayload !== 'object') return null;
    const payload = rawPayload as Partial<LookupEvidencePayload>;
    if (payload.version !== 1 || typeof payload.expiresAt !== 'number' || payload.expiresAt < now || typeof payload.source !== 'string') return null;
    if (payload.provider !== 'mock' && payload.provider !== 'webhook' && payload.provider !== 'dadata' && payload.provider !== 'fns_npd') return null;
    if (payload.organizationId !== context.organizationId || payload.userId !== context.userId) return null;
    const company = companyLookupResultSchema.safeParse(payload.company);
    const expected = companyLookupResultSchema.safeParse(expectedCompany);
    if (!company.success || !expected.success || JSON.stringify(evidenceCompany(company.data)) !== JSON.stringify(evidenceCompany(expected.data))) return null;
    return { source: payload.source, provider: payload.provider };
  } catch {
    return null;
  }
}

const DEV_COMPANIES: Record<string, CompanyLookupResult> = {
  '7701234567': {
    type: 'ul',
    title: 'ООО «ВНАЛ»',
    shortTitle: 'ООО «ВНАЛ»',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027700123456',
    address: 'г. Москва',
    status: 'Действующая организация',
    registrationDate: '17.08.2025',
  },
  '772345678012': {
    type: 'ip',
    title: 'ИП Косилов А. В.',
    shortTitle: 'ИП Косилов А. В.',
    inn: '772345678012',
    ogrn: '325770000123456',
    address: 'г. Москва',
    status: 'Действующий ИП',
    registrationDate: '01.11.2025',
  },
};

export async function lookupCompanyByInn(
  inn: string,
  context: CompanyLookupContext,
  kind: CompanyLookupKind = 'auto',
): Promise<{ company: CompanyLookupResult; source: string; demo: boolean; lookupEvidence: string }> {
  if (kind === 'smz') {
    const company = await lookupFnsNpdStatus(inn);
    const source = 'ФНС России · НПД';
    return { company, source, demo: false, lookupEvidence: createCompanyLookupEvidence(company, source, 'fns_npd', context) };
  }

  if (env.COMPANY_LOOKUP_PROVIDER === 'disabled') {
    throw new AppError({
      code: 'COMPANY_LOOKUP_UNAVAILABLE',
      message: 'Автоматический поиск организаций пока не подключён. Используйте ручной ввод.',
      statusCode: 503,
    });
  }

  if (env.COMPANY_LOOKUP_PROVIDER === 'mock') {
    const company = DEV_COMPANIES[inn];
    if (!company) {
      throw new AppError({
        code: 'COMPANY_NOT_FOUND',
        message: 'В dev-каталоге организация с таким ИНН не найдена',
        statusCode: 404,
      });
    }
    const source = 'B4 dev registry';
    return { company, source, demo: true, lookupEvidence: createCompanyLookupEvidence(company, source, 'mock', context) };
  }

  if (env.COMPANY_LOOKUP_PROVIDER === 'dadata') {
    const company = await lookupDadataCompany(inn, kind);
    if (!company) {
      throw new AppError({ code: 'COMPANY_NOT_FOUND', message: 'Организация или ИП с таким ИНН не найдены', statusCode: 404 });
    }
    const source = 'DaData · ЕГРЮЛ/ЕГРИП';
    return { company, source, demo: false, lookupEvidence: createCompanyLookupEvidence(company, source, 'dadata', context) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.COMPANY_LOOKUP_WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(env.COMPANY_LOOKUP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.COMPANY_LOOKUP_WEBHOOK_TOKEN ? { authorization: `Bearer ${env.COMPANY_LOOKUP_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ inn, kind }),
      signal: controller.signal,
    });
    if (response.status === 404) {
      throw new AppError({ code: 'COMPANY_NOT_FOUND', message: 'Организация с таким ИНН не найдена', statusCode: 404 });
    }
    if (!response.ok) {
      throw new AppError({ code: 'COMPANY_LOOKUP_FAILED', message: 'Сервис поиска организаций временно недоступен', statusCode: 502 });
    }
    const parsedPayload = companyLookupWebhookResponseSchema.safeParse(await response.json());
    if (!parsedPayload.success) {
      throw new AppError({ code: 'COMPANY_LOOKUP_INVALID_RESPONSE', message: 'Сервис поиска вернул неполные данные', statusCode: 502 });
    }
    const company = 'company' in parsedPayload.data ? parsedPayload.data.company : parsedPayload.data;
    if (company.inn !== inn) {
      throw new AppError({ code: 'COMPANY_LOOKUP_INN_MISMATCH', message: 'Сервис поиска вернул данные другой организации', statusCode: 502 });
    }
    try {
      validateCompanyIdentifiers({
        inn: company.inn,
        ...(company.kpp !== undefined ? { kpp: company.kpp } : {}),
        ...(company.ogrn !== undefined ? { ogrn: company.ogrn } : {}),
        legalType: company.type,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw new AppError({ code: 'COMPANY_LOOKUP_INVALID_RESPONSE', message: 'Сервис поиска вернул противоречивые данные', statusCode: 502 });
      }
      throw error;
    }
    const source = 'company' in parsedPayload.data ? parsedPayload.data.source || 'registry-webhook' : 'registry-webhook';
    return { company, source, demo: false, lookupEvidence: createCompanyLookupEvidence(company, source, 'webhook', context) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError({ code: 'COMPANY_LOOKUP_TIMEOUT', message: 'Сервис поиска организаций не ответил вовремя', statusCode: 504 });
    }
    throw new AppError({ code: 'COMPANY_LOOKUP_FAILED', message: 'Не удалось выполнить поиск организации', statusCode: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCompanyProfile(app: FastifyInstance, organizationId: string) {
  const organization = await app.prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization || organization.status !== 'ACTIVE') {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
  }
  const business = await app.prisma.business.findFirst({
    where: { organizationId, status: 'ACTIVE', isPrimary: true },
    include: { locations: { where: { status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  });

  return {
    company: {
      title: organization.name,
      inn: organization.inn ?? '',
      kpp: organization.kpp ?? '',
      ogrn: organization.ogrn ?? '',
      legalAddress: organization.legalAddress ?? '',
      registrationDate: formatRegistrationDate(organization.registrationDate),
      registryStatus: organization.legalStatus ?? '',
      registrySource: organization.registrySource ?? '',
      verified: Boolean(organization.registryVerifiedAt),
      website: organization.website ?? business?.website ?? '',
      industry: organization.industry ?? business?.industry ?? '',
    },
    organization,
    business,
    locations: business?.locations ?? [],
  };
}

export async function updateCompanyProfile(
  app: FastifyInstance,
  request: FastifyRequest,
  input: z.infer<typeof updateCompanyProfileSchema>,
) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  const organizationId = request.auth.organizationId;
  const current = await app.prisma.organization.findUnique({ where: { id: organizationId } });
  if (!current || current.status !== 'ACTIVE') {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
  }

  const nextInn = Object.prototype.hasOwnProperty.call(input, 'inn') ? input.inn || null : current.inn;
  const nextKpp = Object.prototype.hasOwnProperty.call(input, 'kpp') ? input.kpp || null : current.kpp;
  const nextOgrn = Object.prototype.hasOwnProperty.call(input, 'ogrn') ? input.ogrn || null : current.ogrn;
  const legalType = (current.legalType === 'ul' || current.legalType === 'ip' || current.legalType === 'smz')
    ? current.legalType
    : inferLegalType(nextInn);
  validateCompanyIdentifiers({ inn: nextInn, kpp: nextKpp, ogrn: nextOgrn, legalType });

  const registryIdentityChanged = nextInn !== current.inn || nextKpp !== current.kpp || nextOgrn !== current.ogrn;

  await app.prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organizationId },
      data: {
        ...(input.title !== undefined ? { name: input.title } : {}),
        ...(input.title !== undefined ? { legalName: input.title } : {}),
        ...(input.website !== undefined ? { website: input.website || null } : {}),
        ...(input.industry !== undefined ? { industry: input.industry || null } : {}),
        ...(input.inn !== undefined ? { inn: input.inn || null, legalType } : {}),
        ...(input.kpp !== undefined ? { kpp: input.kpp || null } : {}),
        ...(input.ogrn !== undefined ? { ogrn: input.ogrn || null } : {}),
        ...(input.legalAddress !== undefined ? { legalAddress: input.legalAddress || null } : {}),
        ...(input.registrationDate !== undefined ? { registrationDate: parseRegistrationDate(input.registrationDate) } : {}),
        ...(input.registryStatus !== undefined ? { legalStatus: input.registryStatus || null } : {}),
        ...(registryIdentityChanged ? { registryVerifiedAt: null, registrySource: 'manual' } : {}),
      },
    });

    let primary = await tx.business.findFirst({ where: { organizationId, status: 'ACTIVE', isPrimary: true } });
    if (!primary) {
      primary = await tx.business.create({
        data: { organizationId, name: input.title || current.name, legalName: input.title || current.name, isPrimary: true },
      });
    }
    await tx.business.update({
      where: { id: primary.id },
      data: {
        ...(input.title !== undefined ? { name: input.title, legalName: input.title } : {}),
        ...(input.website !== undefined ? { website: input.website || null } : {}),
        ...(input.industry !== undefined ? { industry: input.industry || null } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'company.profile.updated',
        entityType: 'organization',
        entityId: organizationId,
        metadata: { fields: Object.keys(input), registryIdentityChanged },
        ipAddress: request.ip,
        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
      },
    });
  });

  return getCompanyProfile(app, organizationId);
}
