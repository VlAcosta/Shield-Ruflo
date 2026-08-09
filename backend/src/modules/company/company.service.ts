import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { updateCompanyProfileSchema } from './company.schemas.js';
import {
  formatRegistrationDate,
  inferLegalType,
  parseRegistrationDate,
  validateCompanyIdentifiers,
} from '../../shared/domain/company.js';

type CompanyLookupResult = {
  type: 'ul' | 'ip';
  title: string;
  shortTitle?: string;
  inn: string;
  kpp?: string;
  ogrn?: string;
  address?: string;
  status?: string;
  registrationDate?: string;
};

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

export async function lookupCompanyByInn(inn: string): Promise<{ company: CompanyLookupResult; source: string; demo: boolean }> {
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
    return { company, source: 'B4 dev registry', demo: true };
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
      body: JSON.stringify({ inn }),
      signal: controller.signal,
    });
    if (response.status === 404) {
      throw new AppError({ code: 'COMPANY_NOT_FOUND', message: 'Организация с таким ИНН не найдена', statusCode: 404 });
    }
    if (!response.ok) {
      throw new AppError({ code: 'COMPANY_LOOKUP_FAILED', message: 'Сервис поиска организаций временно недоступен', statusCode: 502 });
    }
    const payload = await response.json() as { company?: CompanyLookupResult; source?: string } & Partial<CompanyLookupResult>;
    const company = payload.company ?? payload;
    if (!company.inn || !company.title) {
      throw new AppError({ code: 'COMPANY_LOOKUP_INVALID_RESPONSE', message: 'Сервис поиска вернул неполные данные', statusCode: 502 });
    }
    return { company: company as CompanyLookupResult, source: payload.source || 'registry-webhook', demo: false };
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
      website: business?.website ?? '',
      industry: business?.industry ?? '',
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
  const legalType = inferLegalType(nextInn) ?? (current.legalType === 'ul' || current.legalType === 'ip' ? current.legalType : null);
  validateCompanyIdentifiers({ inn: nextInn, kpp: nextKpp, ogrn: nextOgrn, legalType });

  const registryIdentityChanged = nextInn !== current.inn || nextKpp !== current.kpp || nextOgrn !== current.ogrn;

  await app.prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organizationId },
      data: {
        ...(input.title !== undefined ? { name: input.title } : {}),
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
