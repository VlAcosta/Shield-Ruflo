import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { assertUsageLimit } from '../../modules/billing/billing.service.js';
import { hashSessionToken } from '../../shared/security/tokens.js';

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

type GenericParams = Record<string, string | undefined>;
type GenericBody = Record<string, unknown>;

function routeMethodIncludes(route: RouteOptions, method: string): boolean {
  const methods = Array.isArray(route.method) ? route.method : [route.method];
  return methods.some((item) => String(item).toUpperCase() === method);
}

function routePath(route: RouteOptions): string {
  const value = String(route.url || '');
  return value.startsWith('/api/v1') ? value.slice('/api/v1'.length) || '/' : value;
}

function appendPreHandler(route: RouteOptions, handler: Handler): void {
  const current = route.preHandler
    ? (Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler])
    : [];
  route.preHandler = [...current, handler];
}

function organizationId(request: FastifyRequest): string {
  if (!request.auth?.organizationId) {
    throw new AppError({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'Рабочее пространство не выбрано',
      statusCode: 409,
    });
  }
  return request.auth.organizationId;
}

function bodyObject(request: FastifyRequest): GenericBody {
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as GenericBody
    : {};
}

function paramsObject(request: FastifyRequest): GenericParams {
  return request.params && typeof request.params === 'object' && !Array.isArray(request.params)
    ? request.params as GenericParams
    : {};
}

export const entitlementEnforcementPlugin = fp(async (app) => {
  app.addHook('onRoute', (route) => {
    const path = routePath(route);

    if (routeMethodIncludes(route, 'POST') && path === '/businesses/:businessId/locations') {
      appendPreHandler(route, async (request) => {
        await assertUsageLimit(app, organizationId(request), 'locations.max', 1);
      });
      return;
    }

    if (routeMethodIncludes(route, 'POST') && path === '/review-sources') {
      appendPreHandler(route, async (request) => {
        await assertUsageLimit(app, organizationId(request), 'review_sources.max', 1);
      });
      return;
    }

    if (routeMethodIncludes(route, 'POST') && path === '/competitive/competitors') {
      appendPreHandler(route, async (request) => {
        await assertUsageLimit(app, organizationId(request), 'competitors.max', 1);
      });
      return;
    }

    if (routeMethodIncludes(route, 'PATCH') && path === '/competitive/competitors/:competitorId') {
      appendPreHandler(route, async (request) => {
        const status = String(bodyObject(request).status || '').toUpperCase();
        if (status !== 'ACTIVE') return;
        const competitorId = paramsObject(request).competitorId;
        if (!competitorId) return;
        const current = await app.prisma.competitiveCompetitor.findFirst({
          where: { id: competitorId, organizationId: organizationId(request) },
          select: { status: true },
        });
        if (current && current.status !== 'ACTIVE') {
          await assertUsageLimit(app, organizationId(request), 'competitors.max', 1);
        }
      });
      return;
    }

    if (routeMethodIncludes(route, 'POST') && path === '/automations') {
      appendPreHandler(route, async (request) => {
        const orgId = organizationId(request);
        // The commercial meter currently counts enabled automations. Disabled
        // rules still consume the plan rule quota, so include them as reserved
        // capacity when creating a new rule.
        const disabled = await app.prisma.automation.count({ where: { organizationId: orgId, enabled: false } });
        await assertUsageLimit(app, orgId, 'automation_rules.max', disabled + 1);
      });
      return;
    }

    if (routeMethodIncludes(route, 'PATCH') && path === '/automations/:automationId') {
      appendPreHandler(route, async (request) => {
        if (bodyObject(request).enabled !== true) return;
        const automationId = paramsObject(request).automationId;
        if (!automationId) return;
        const orgId = organizationId(request);
        const current = await app.prisma.automation.findFirst({
          where: { id: automationId, organizationId: orgId },
          select: { enabled: true },
        });
        if (current && !current.enabled) {
          await assertUsageLimit(app, orgId, 'automation_rules.max', 1);
        }
      });
      return;
    }

    if (routeMethodIncludes(route, 'POST') && path === '/team/invitations') {
      appendPreHandler(route, async (request) => {
        const orgId = organizationId(request);
        const now = new Date();
        const email = String(bodyObject(request).email || '').trim().toLowerCase();
        const pending = await app.prisma.teamInvitation.count({
          where: {
            organizationId: orgId,
            status: 'PENDING',
            expiresAt: { gt: now },
            ...(email ? { email: { not: email } } : {}),
          },
        });
        // Pending invitations reserve seats so several simultaneous invitations
        // cannot oversubscribe users.max before acceptance.
        await assertUsageLimit(app, orgId, 'users.max', pending + 1);
      });
      return;
    }

    if (routeMethodIncludes(route, 'POST') && path === '/team/invitations/:token/accept') {
      appendPreHandler(route, async (request) => {
        if (!request.auth) return;
        const token = paramsObject(request).token;
        if (!token) return;
        const invitation = await app.prisma.teamInvitation.findUnique({
          where: { tokenHash: hashSessionToken(token) },
          select: { organizationId: true, status: true, acceptedByUserId: true },
        });
        if (!invitation || invitation.status !== 'PENDING') return;
        const existing = await app.prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: invitation.organizationId, userId: request.auth.userId } },
          select: { id: true, status: true },
        });
        if (existing?.status === 'ACTIVE') return;
        await assertUsageLimit(app, invitation.organizationId, 'users.max', 1);
      });
    }
  });
});
