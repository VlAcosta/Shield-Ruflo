import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { assertEntitlement } from '../../modules/billing/billing.service.js';

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

type PremiumEntitlementKey = 'competitive' | 'aiVisibility' | 'agency';

type RouteGate = {
  entitlement: PremiumEntitlementKey;
  matches(method: string, path: string): boolean;
};

const routeGates: readonly RouteGate[] = Object.freeze([
  {
    entitlement: 'competitive',
    matches: (_method, path) => path === '/competitive' || path.startsWith('/competitive/'),
  },
  {
    entitlement: 'aiVisibility',
    matches: (_method, path) => path === '/ai-visibility' || path.startsWith('/ai-visibility/'),
  },
  {
    entitlement: 'agency',
    // Agency commercial capability belongs to the agency organization. Client
    // acceptance/revocation and safe workspace switching must remain available
    // even when the client itself is on a lower plan, otherwise access could be
    // impossible to revoke or an invitation impossible to accept.
    matches: (method, path) => (
      (method === 'GET' && path === '/agency/portfolio')
      || (method === 'POST' && path === '/agency/invitations')
      || (method === 'PATCH' && path === '/agency/clients/:linkId')
    ),
  },
]);

function methods(route: RouteOptions): string[] {
  return (Array.isArray(route.method) ? route.method : [route.method]).map((item) => String(item).toUpperCase());
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

/**
 * Commercial feature gates are attached to backend routes, after the route's
 * authenticate/authorize handlers. The browser may hide unavailable modules,
 * but it is never the authority that grants a paid capability.
 */
export const premiumEntitlementsPlugin = fp(async (app) => {
  app.addHook('onRoute', (route) => {
    const path = routePath(route);
    const matched = routeGates.find((gate) => methods(route).some((method) => gate.matches(method, path)));
    if (!matched) return;

    appendPreHandler(route, async (request) => {
      await assertEntitlement(app, organizationId(request), matched.entitlement);
    });
  });
});
