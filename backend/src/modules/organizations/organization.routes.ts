import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { parseRegistrationDate, validateCompanyIdentifiers } from '../../shared/domain/company.js';
import { publicUserInclude, presentUser } from '../auth/auth.presenter.js';
import {
  assertActiveOrganization,
  createOrganizationSlug,
  getOrganizationContext,
  listOrganizations,
  requireActiveBusiness,
  requireActiveLocation,
  selectOrganization,
} from './organization.service.js';
import {
  businessIdParamsSchema,
  createBusinessSchema,
  createLocationSchema,
  createOrganizationSchema,
  locationIdParamsSchema,
  organizationIdParamsSchema,
  updateBusinessSchema,
  updateLocationSchema,
  updateOrganizationSchema,
} from './organization.schemas.js';

function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

export const organizationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/organizations', { preHandler: app.authenticate }, async (request) => {
    if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    return { organizations: await listOrganizations(app, request.auth.userId), activeOrganizationId: request.auth.organizationId };
  });

  app.get('/organizations/current', {
    preHandler: [app.authenticate, app.authorize('company.view')],
  }, async (request) => {
    if (!request.auth?.organizationId) throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
    return { context: await getOrganizationContext(app, request.auth.userId, request.auth.organizationId) };
  });

  app.post('/organizations', { preHandler: app.authenticate }, async (request) => {
    if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    const body = createOrganizationSchema.parse(request.body);
    const organization = await app.prisma.organization.create({
      data: {
        name: body.name,
        slug: createOrganizationSlug(body.name),
        timezone: body.timezone,
        locale: body.locale,
        onboardingStatus: 'NOT_STARTED',
        members: { create: { userId: request.auth.userId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
        businesses: { create: { name: body.business_name || body.name, isPrimary: true, status: 'ACTIVE' } },
      },
    });
    await app.prisma.session.update({ where: { id: request.auth.sessionId }, data: { activeOrganizationId: organization.id } });
    await app.prisma.auditLog.create({ data: { organizationId: organization.id, actorUserId: request.auth.userId, action: 'organization.created', entityType: 'organization', entityId: organization.id, ...auditContext(request) } });
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.auth.userId }, include: publicUserInclude });
    return { organization, user: presentUser(user, organization.id) };
  });

  app.post('/organizations/:organizationId/select', { preHandler: app.authenticate }, async (request) => {
    const { organizationId } = organizationIdParamsSchema.parse(request.params);
    return selectOrganization(app, request, organizationId);
  });

  app.patch('/organizations/:organizationId', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const { organizationId } = organizationIdParamsSchema.parse(request.params);
    await assertActiveOrganization(request, organizationId);
    const body = updateOrganizationSchema.parse(request.body);
    const current = await app.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const nextInn = body.inn !== undefined ? body.inn || null : current.inn;
    const nextKpp = body.kpp !== undefined ? body.kpp || null : current.kpp;
    const nextOgrn = body.ogrn !== undefined ? body.ogrn || null : current.ogrn;
    const nextLegalType = body.legal_type !== undefined ? body.legal_type : current.legalType;
    validateCompanyIdentifiers({ inn: nextInn, kpp: nextKpp, ogrn: nextOgrn, legalType: nextLegalType });

    const legalIdentityChanged = nextInn !== current.inn || nextKpp !== current.kpp || nextOgrn !== current.ogrn;
    const organization = await app.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        ...(body.legal_type !== undefined ? { legalType: body.legal_type } : {}),
        ...(body.inn !== undefined ? { inn: body.inn || null } : {}),
        ...(body.kpp !== undefined ? { kpp: body.kpp || null } : {}),
        ...(body.ogrn !== undefined ? { ogrn: body.ogrn || null } : {}),
        ...(body.legal_address !== undefined ? { legalAddress: body.legal_address || null } : {}),
        ...(body.legal_status !== undefined ? { legalStatus: body.legal_status || null } : {}),
        ...(body.registration_date !== undefined ? { registrationDate: parseRegistrationDate(body.registration_date) } : {}),
        ...(legalIdentityChanged ? { registryVerifiedAt: null, registrySource: 'manual' } : {}),
      },
    });
    await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'organization.updated', entityType: 'organization', entityId: organizationId, metadata: { fields: Object.keys(body), legalIdentityChanged }, ...auditContext(request) } });
    return { organization };
  });

  app.get('/organizations/:organizationId/businesses', {
    preHandler: [app.authenticate, app.authorize('company.view')],
  }, async (request) => {
    const { organizationId } = organizationIdParamsSchema.parse(request.params);
    await assertActiveOrganization(request, organizationId);
    const businesses = await app.prisma.business.findMany({ where: { organizationId, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], include: { locations: { where: { status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } });
    return { businesses };
  });

  app.post('/organizations/:organizationId/businesses', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const { organizationId } = organizationIdParamsSchema.parse(request.params);
    await assertActiveOrganization(request, organizationId);
    const body = createBusinessSchema.parse(request.body);
    const business = await app.prisma.$transaction(async (tx) => {
      if (body.is_primary) await tx.business.updateMany({ where: { organizationId, status: 'ACTIVE', isPrimary: true }, data: { isPrimary: false } });
      return tx.business.create({ data: { organizationId, name: body.name, legalName: body.legal_name || null, industry: body.industry || null, website: body.website || null, isPrimary: body.is_primary } });
    });
    await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'business.created', entityType: 'business', entityId: business.id, ...auditContext(request) } });
    return { business };
  });

  app.get('/businesses/:businessId', {
    preHandler: [app.authenticate, app.authorize('company.view')],
  }, async (request) => {
    const { businessId } = businessIdParamsSchema.parse(request.params);
    const business = await requireActiveBusiness(app, request.auth!.organizationId!, businessId);
    return { business };
  });

  app.patch('/businesses/:businessId', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const { businessId } = businessIdParamsSchema.parse(request.params);
    const organizationId = request.auth!.organizationId!;
    await requireActiveBusiness(app, organizationId, businessId);
    const body = updateBusinessSchema.parse(request.body);
    const business = await app.prisma.$transaction(async (tx) => {
      if (body.is_primary === true) await tx.business.updateMany({ where: { organizationId, status: 'ACTIVE', isPrimary: true, NOT: { id: businessId } }, data: { isPrimary: false } });
      if (body.is_primary === false) {
        const current = await tx.business.findUniqueOrThrow({ where: { id: businessId } });
        if (current.isPrimary) throw new AppError({ code: 'PRIMARY_BUSINESS_REQUIRED', message: 'Сначала назначьте основной бизнес', statusCode: 409 });
      }
      return tx.business.update({
        where: { id: businessId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.legal_name !== undefined ? { legalName: body.legal_name || null } : {}),
          ...(body.industry !== undefined ? { industry: body.industry || null } : {}),
          ...(body.website !== undefined ? { website: body.website || null } : {}),
          ...(body.is_primary !== undefined ? { isPrimary: body.is_primary } : {}),
        },
      });
    });
    await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'business.updated', entityType: 'business', entityId: businessId, metadata: { fields: Object.keys(body) }, ...auditContext(request) } });
    return { business };
  });

  app.delete('/businesses/:businessId', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const { businessId } = businessIdParamsSchema.parse(request.params);
    const organizationId = request.auth!.organizationId!;
    const current = await requireActiveBusiness(app, organizationId, businessId);
    await app.prisma.$transaction(async (tx) => {
      if (current.isPrimary) {
        const replacement = await tx.business.findFirst({ where: { organizationId, status: 'ACTIVE', NOT: { id: businessId } }, orderBy: { createdAt: 'asc' } });
        if (!replacement) throw new AppError({ code: 'CANNOT_ARCHIVE_ONLY_BUSINESS', message: 'Нельзя архивировать единственный бизнес организации', statusCode: 409 });
        await tx.business.update({ where: { id: businessId }, data: { isPrimary: false } });
        await tx.business.update({ where: { id: replacement.id }, data: { isPrimary: true } });
      }
      await tx.business.update({ where: { id: businessId }, data: { status: 'ARCHIVED', isPrimary: false, archivedAt: new Date() } });
    });
    await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'business.archived', entityType: 'business', entityId: businessId, ...auditContext(request) } });
    return { ok: true };
  });

  app.get('/businesses/:businessId/locations', {
    preHandler: [app.authenticate, app.authorize('company.view')],
  }, async (request) => {
    const { businessId } = businessIdParamsSchema.parse(request.params);
    const business = await requireActiveBusiness(app, request.auth!.organizationId!, businessId);
    return { locations: business.locations };
  });

  app.post('/businesses/:businessId/locations', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const { businessId } = businessIdParamsSchema.parse(request.params);
    const organizationId = request.auth!.organizationId!;
    await requireActiveBusiness(app, organizationId, businessId);
    const body = createLocationSchema.parse(request.body);
    const location = await app.prisma.$transaction(async (tx) => {
      const count = await tx.location.count({ where: { businessId, status: 'ACTIVE' } });
      const makePrimary = body.is_primary || count === 0;
      if (makePrimary) await tx.location.updateMany({ where: { businessId, status: 'ACTIVE', isPrimary: true }, data: { isPrimary: false } });
      return tx.location.create({ data: { businessId, name: body.name, isPrimary: makePrimary, countryCode: body.country_code || null, region: body.region || null, city: body.city || null, addressLine1: body.address_line_1 || null, addressLine2: body.address_line_2 || null, postalCode: body.postal_code || null, latitude: body.latitude ?? null, longitude: body.longitude ?? null, timezone: body.timezone || null } });
    });
    await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'location.created', entityType: 'location', entityId: location.id, ...auditContext(request) } });
    return { location };
  });

  app.patch('/locations/:locationId', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const { locationId } = locationIdParamsSchema.parse(request.params);
    const organizationId = request.auth!.organizationId!;
    const current = await requireActiveLocation(app, organizationId, locationId);
    const body = updateLocationSchema.parse(request.body);
    const location = await app.prisma.$transaction(async (tx) => {
      if (body.is_primary === true) await tx.location.updateMany({ where: { businessId: current.businessId, status: 'ACTIVE', isPrimary: true, NOT: { id: locationId } }, data: { isPrimary: false } });
      if (body.is_primary === false && current.isPrimary) {
        const replacement = await tx.location.findFirst({ where: { businessId: current.businessId, status: 'ACTIVE', NOT: { id: locationId } }, orderBy: { createdAt: 'asc' } });
        if (!replacement) throw new AppError({ code: 'PRIMARY_LOCATION_REQUIRED', message: 'У активного бизнеса должен оставаться основной филиал', statusCode: 409 });
        await tx.location.update({ where: { id: locationId }, data: { isPrimary: false } });
        await tx.location.update({ where: { id: replacement.id }, data: { isPrimary: true } });
      }
      return tx.location.update({
        where: { id: locationId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.is_primary !== undefined ? { isPrimary: body.is_primary } : {}),
          ...(body.country_code !== undefined ? { countryCode: body.country_code || null } : {}),
          ...(body.region !== undefined ? { region: body.region || null } : {}),
          ...(body.city !== undefined ? { city: body.city || null } : {}),
          ...(body.address_line_1 !== undefined ? { addressLine1: body.address_line_1 || null } : {}),
          ...(body.address_line_2 !== undefined ? { addressLine2: body.address_line_2 || null } : {}),
          ...(body.postal_code !== undefined ? { postalCode: body.postal_code || null } : {}),
          ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
          ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
          ...(body.timezone !== undefined ? { timezone: body.timezone || null } : {}),
        },
      });
    });
    await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'location.updated', entityType: 'location', entityId: locationId, metadata: { fields: Object.keys(body) }, ...auditContext(request) } });
    return { location };
  });

  app.delete('/locations/:locationId', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const { locationId } = locationIdParamsSchema.parse(request.params);
    const organizationId = request.auth!.organizationId!;
    const current = await requireActiveLocation(app, organizationId, locationId);
    await app.prisma.$transaction(async (tx) => {
      if (current.isPrimary) {
        const replacement = await tx.location.findFirst({ where: { businessId: current.businessId, status: 'ACTIVE', NOT: { id: locationId } }, orderBy: { createdAt: 'asc' } });
        if (!replacement) throw new AppError({ code: 'PRIMARY_LOCATION_REQUIRED', message: 'У активного бизнеса должен оставаться основной филиал', statusCode: 409 });
        await tx.location.update({ where: { id: locationId }, data: { isPrimary: false } });
        await tx.location.update({ where: { id: replacement.id }, data: { isPrimary: true } });
      }
      await tx.location.update({ where: { id: locationId }, data: { status: 'ARCHIVED', isPrimary: false, archivedAt: new Date() } });
    });
    await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'location.archived', entityType: 'location', entityId: locationId, ...auditContext(request) } });
    return { ok: true };
  });
};
