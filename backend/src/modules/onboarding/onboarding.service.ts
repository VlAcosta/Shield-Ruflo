import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { completeOnboardingSchema, saveOnboardingStateSchema } from './onboarding.schemas.js';
import { parseRegistrationDate, validateCompanyIdentifiers } from '../../shared/domain/company.js';
import { presentUser, publicUserInclude } from '../auth/auth.presenter.js';

export async function getOnboardingState(app: FastifyInstance, organizationId: string) {
  const organization = await app.prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      onboardingStatus: true,
      onboardingStep: true,
      onboardingDraft: true,
      onboardingStartedAt: true,
      onboardingCompletedAt: true,
    },
  });
  if (!organization) {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
  }
  return { onboarding: organization };
}

export async function startOnboarding(app: FastifyInstance, organizationId: string) {
  const current = await app.prisma.organization.findUnique({ where: { id: organizationId } });
  if (!current) {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
  }
  if (current.onboardingStatus === 'COMPLETED') return getOnboardingState(app, organizationId);

  await app.prisma.organization.update({
    where: { id: organizationId },
    data: {
      onboardingStatus: 'IN_PROGRESS',
      onboardingStartedAt: current.onboardingStartedAt ?? new Date(),
    },
  });
  return getOnboardingState(app, organizationId);
}

export async function saveOnboardingState(
  app: FastifyInstance,
  organizationId: string,
  input: z.infer<typeof saveOnboardingStateSchema>,
) {
  const current = await app.prisma.organization.findUnique({ where: { id: organizationId }, select: { onboardingStatus: true, onboardingStartedAt: true } });
  if (!current) {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
  }
  if (current.onboardingStatus === 'COMPLETED') {
    throw new AppError({ code: 'ONBOARDING_ALREADY_COMPLETED', message: 'Первичная настройка уже завершена', statusCode: 409 });
  }

  await app.prisma.organization.update({
    where: { id: organizationId },
    data: {
      onboardingStatus: 'IN_PROGRESS',
      onboardingStartedAt: current.onboardingStartedAt ?? new Date(),
      onboardingStep: input.step,
      onboardingDraft: JSON.parse(JSON.stringify(input.draft)),
    },
  });
  return getOnboardingState(app, organizationId);
}

export async function completeOnboarding(
  app: FastifyInstance,
  request: FastifyRequest,
  input: z.infer<typeof completeOnboardingSchema>,
) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не создано', statusCode: 409 });
  }
  const organizationId = request.auth.organizationId;
  validateCompanyIdentifiers({
    inn: input.organization.inn,
    ...(input.organization.kpp !== undefined ? { kpp: input.organization.kpp } : {}),
    ...(input.organization.ogrn !== undefined ? { ogrn: input.organization.ogrn } : {}),
    legalType: input.organization.type,
  });

  const now = new Date();
  const registryTrusted = Boolean(input.organization.source)
    && input.organization.source !== 'Ручной ввод'
    && !input.organization.demo;

  await app.prisma.$transaction(async (tx) => {
    const membership = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: request.auth!.userId } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
    }

    await tx.organization.update({
      where: { id: organizationId },
      data: {
        name: input.organization.title,
        legalType: input.organization.type,
        inn: input.organization.inn,
        kpp: input.organization.kpp || null,
        ogrn: input.organization.ogrn || null,
        legalAddress: input.organization.address || null,
        legalStatus: input.organization.status || null,
        registrationDate: parseRegistrationDate(input.organization.registrationDate),
        registrySource: input.organization.source || (input.organization.demo ? 'demo' : 'manual'),
        registryVerifiedAt: registryTrusted ? now : null,
        onboardingStatus: 'COMPLETED',
        onboardingStep: 2,
        onboardingDraft: Prisma.DbNull,
        onboardingCompletedAt: now,
      },
    });

    let primary = await tx.business.findFirst({
      where: { organizationId, status: 'ACTIVE', isPrimary: true },
      orderBy: { createdAt: 'asc' },
    });
    const businessName = input.business?.name || input.organization.title;
    if (primary) {
      primary = await tx.business.update({
        where: { id: primary.id },
        data: {
          name: businessName,
          legalName: input.organization.title,
          website: input.business?.website || null,
          industry: input.business?.industry || null,
        },
      });
    } else {
      primary = await tx.business.create({
        data: {
          organizationId,
          name: businessName,
          legalName: input.organization.title,
          website: input.business?.website || null,
          industry: input.business?.industry || null,
          isPrimary: true,
        },
      });
    }

    if (input.locations.length) {
      await tx.location.updateMany({ where: { businessId: primary.id, status: 'ACTIVE' }, data: { isPrimary: false } });
      const requestedPrimaryIndex = input.locations.findIndex((location) => location.is_primary);
      const primaryIndex = requestedPrimaryIndex >= 0 ? requestedPrimaryIndex : 0;
      for (const [index, location] of input.locations.entries()) {
        await tx.location.create({
          data: {
            businessId: primary.id,
            name: location.name,
            isPrimary: index === primaryIndex,
            countryCode: location.country_code || null,
            region: location.region || null,
            city: location.city || null,
            addressLine1: location.address_line_1 || null,
            addressLine2: location.address_line_2 || null,
            postalCode: location.postal_code || null,
            latitude: location.latitude ?? null,
            longitude: location.longitude ?? null,
            timezone: location.timezone || null,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'onboarding.completed',
        entityType: 'organization',
        entityId: organizationId,
        metadata: {
          integrations: input.integrations,
          inn: input.organization.inn,
          registryTrusted,
          locations: input.locations.length,
        },
        ipAddress: request.ip,
        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
      },
    });
  });

  const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.auth.userId }, include: publicUserInclude });
  return {
    ok: true,
    user: presentUser(user, organizationId),
    context: {
      organizationId,
      onboardingStatus: 'COMPLETED' as const,
    },
  };
}
