import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { assertAiRequestBudget } from '../../shared/operations/ai-request-budget.js';

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

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

export function isExpensiveAiMutation(method: string, path: string): boolean {
  if (method !== 'POST') return false;
  return path === '/ask-shield/queries'
    || path === '/reviews/:reviewId/ai-reply'
    || path === '/reviews/:reviewId/intelligence/reanalyze'
    || path === '/ai-visibility/probes/:probeId/runs';
}

/**
 * Shared PostgreSQL-backed budgets are appended after route authentication and
 * authorization. They protect operations that may enqueue paid provider work,
 * while read-only AI state and non-AI product traffic remain unaffected.
 */
export const aiRequestBudgetPlugin = fp(async (app) => {
  app.addHook('onRoute', (route) => {
    const path = routePath(route);
    if (!methods(route).some((method) => isExpensiveAiMutation(method, path))) return;

    appendPreHandler(route, async (request) => {
      const organizationId = request.auth?.organizationId;
      const userId = request.auth?.userId;
      if (!organizationId || !userId) {
        throw new AppError({
          code: 'ORGANIZATION_CONTEXT_REQUIRED',
          message: 'Рабочее пространство не выбрано',
          statusCode: 409,
        });
      }
      await assertAiRequestBudget(app, { organizationId, userId });
    });
  });
});
