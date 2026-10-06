import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import {
  createAdminPlan,
  getAdminAnalytics,
  getAdminDashboard,
  getAdminSettings,
  getAdminSubscriptions,
  listAdminClients,
  updateAdminPlan,
  updateAdminSubscription,
} from './admin.service.js';
import {
  addAdminSupportMessage,
  listAdminSupportTickets,
  updateAdminSupportTicket,
} from '../support/support.service.js';

const clientParams = z.object({ clientId: z.string().uuid() });
const planParams = z.object({ planId: z.string().min(1).max(120) });
const analyticsQuery = z.object({ period: z.enum(['month', 'quarter', 'year']).default('month') });
const clientPatch = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED', 'active', 'suspended', 'archived']).optional(),
  legalName: z.string().trim().min(1).max(240).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  website: z.string().url().nullable().optional(),
}).strict();
const planPatch = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  price: z.number().min(0).max(10_000_000).optional(),
  active: z.boolean().optional(),
}).strict();
const planCreate = z.object({
  code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(160),
  price: z.number().min(0).max(10_000_000),
  currency: z.string().length(3).optional(),
}).strict();
const subscriptionPatch = z.object({ autoRenew: z.boolean() }).strict();
const ticketParams = z.object({ ticketId: z.string().uuid() });
const ticketPatch = z.object({
  status: z.enum(['open', 'in_progress', 'waiting', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  unread: z.number().int().min(0).max(10_000).optional(),
  assignedManagerId: z.string().uuid().nullable().optional(),
  assignedManagerName: z.string().max(180).optional(),
  updatedAt: z.string().max(80).optional(),
}).strict();
const ticketMessage = z.object({
  text: z.string().trim().min(1).max(10_000),
  internal: z.boolean().optional(),
}).strict();

function normalizeIdentity(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

async function assertPlatformAdmin(app: Parameters<FastifyPluginAsync>[0], request: FastifyRequest) {
  const user = await app.prisma.user.findUnique({
    where: { id: request.auth!.userId },
    select: { id: true, email: true, phone: true, status: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    throw new AppError({ code: 'PLATFORM_ADMIN_ACCESS_DENIED', message: 'Доступ к панели администратора запрещён', statusCode: 403 });
  }

  const identities = new Set([normalizeIdentity(user.email), normalizeIdentity(user.phone)].filter(Boolean));
  const allowed = env.PLATFORM_ADMIN_IDENTITIES.length > 0
    && env.PLATFORM_ADMIN_IDENTITIES.some((identity) => identities.has(identity));

  if (!allowed) {
    request.log.warn({ userId: user.id }, 'Denied platform admin access');
    throw new AppError({ code: 'PLATFORM_ADMIN_ACCESS_DENIED', message: 'Доступ к панели администратора запрещён', statusCode: 403 });
  }
}

async function listPlatformManagers(app: Parameters<FastifyPluginAsync>[0]) {
  const emailIdentities = env.PLATFORM_ADMIN_IDENTITIES.filter((identity) => identity.includes('@'));
  const phoneIdentities = env.PLATFORM_ADMIN_IDENTITIES.filter((identity) => !identity.includes('@'));
  if (!emailIdentities.length && !phoneIdentities.length) return [];

  const users = await app.prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        ...(emailIdentities.length ? [{ email: { in: emailIdentities, mode: 'insensitive' as const } }] : []),
        ...(phoneIdentities.length ? [{ phone: { in: phoneIdentities } }] : []),
      ],
    },
    select: { id: true, displayName: true, firstName: true, lastName: true, email: true, phone: true },
    orderBy: { createdAt: 'asc' },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.phone || 'Администратор',
    email: user.email || '',
    role: 'Platform admin',
    status: 'active',
  }));
}

async function assertAssignableManager(app: Parameters<FastifyPluginAsync>[0], managerId: string | null | undefined) {
  if (!managerId) return;
  const managers = await listPlatformManagers(app);
  if (!managers.some((manager) => manager.id === managerId)) {
    throw new AppError({ code: 'ADMIN_MANAGER_NOT_FOUND', message: 'Менеджер поддержки не найден', statusCode: 404 });
  }
}

function requestIdempotencyKey(request: FastifyRequest) {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, 160) : null;
}

function notConfigured(feature: string): never {
  throw new AppError({
    code: 'PLATFORM_ADMIN_FEATURE_NOT_CONFIGURED',
    message: `${feature} ещё не подключён к production backend`,
    statusCode: 501,
  });
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', async (request) => assertPlatformAdmin(app, request));

  app.get('/admin/access', async () => ({ allowed: true }));

  app.get('/admin/dashboard', async () => getAdminDashboard(app));

  app.get('/admin/clients', async () => ({ clients: await listAdminClients(app), source: 'api' }));

  app.get('/admin/clients/:clientId', async (request) => {
    const { clientId } = clientParams.parse(request.params);
    const clients = await listAdminClients(app);
    const client = clients.find((item) => item.id === clientId);
    if (!client) throw new AppError({ code: 'ADMIN_CLIENT_NOT_FOUND', message: 'Клиент не найден', statusCode: 404 });
    const activity = await app.prisma.auditLog.findMany({
      where: { organizationId: clientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, metadata: true },
    });
    return {
      client,
      activity: activity.map((item) => ({
        id: item.id,
        type: item.entityType || 'audit',
        title: item.action,
        date: new Intl.DateTimeFormat('ru-RU').format(item.createdAt),
        metadata: item.metadata,
      })),
      tickets: (await listAdminSupportTickets(app)).filter((ticket) => ticket.clientId === clientId),
      activitySeries: { labels: [], values: [], measured: false },
      supportConfigured: true,
      source: 'api',
    };
  });

  app.post('/admin/clients', async () => notConfigured('Создание клиента из platform-admin')); 

  app.patch('/admin/clients/:clientId', async (request) => {
    const { clientId } = clientParams.parse(request.params);
    const patch = clientPatch.parse(request.body);
    const current = await app.prisma.organization.findUnique({ where: { id: clientId } });
    if (!current) throw new AppError({ code: 'ADMIN_CLIENT_NOT_FOUND', message: 'Клиент не найден', statusCode: 404 });
    const status = patch.status ? patch.status.toUpperCase() as 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' : undefined;
    await app.prisma.organization.update({
      where: { id: clientId },
      data: {
        ...(status ? { status } : {}),
        ...(patch.legalName !== undefined ? { legalName: patch.legalName } : {}),
        ...(patch.industry !== undefined ? { industry: patch.industry } : {}),
        ...(patch.website !== undefined ? { website: patch.website } : {}),
      },
    });
    const clients = await listAdminClients(app);
    return { client: clients.find((item) => item.id === clientId) };
  });

  app.get('/admin/managers', async () => ({
    managers: await listPlatformManagers(app),
    configured: true,
    source: 'api',
  }));
  app.post('/admin/managers', async () => notConfigured('Управление platform-менеджерами'));
  app.patch('/admin/managers/:managerId', async () => notConfigured('Управление platform-менеджерами'));

  app.get('/admin/tickets', async () => ({
    tickets: await listAdminSupportTickets(app),
    configured: true,
    source: 'api',
  }));

  app.patch('/admin/tickets/:ticketId', async (request) => {
    const { ticketId } = ticketParams.parse(request.params);
    const patch = ticketPatch.parse(request.body);
    await assertAssignableManager(app, patch.assignedManagerId);
    return {
      ticket: await updateAdminSupportTicket(app, request.auth!.userId, ticketId, {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.unread !== undefined ? { unread: patch.unread } : {}),
        ...(patch.assignedManagerId !== undefined ? { assignedManagerId: patch.assignedManagerId } : {}),
      }),
    };
  });

  app.post('/admin/tickets/:ticketId/messages', async (request, reply) => {
    const { ticketId } = ticketParams.parse(request.params);
    const body = ticketMessage.parse(request.body);
    const ticket = await addAdminSupportMessage(app, request.auth!.userId, ticketId, {
      text: body.text,
      internal: body.internal,
      idempotencyKey: requestIdempotencyKey(request),
    });
    return reply.code(201).send({ ticket });
  });

  app.get('/admin/subscriptions', async () => ({ ...(await getAdminSubscriptions(app)), source: 'api' }));

  app.post('/admin/subscriptions/plans', async (request, reply) => {
    const plan = await createAdminPlan(app, planCreate.parse(request.body));
    return reply.code(201).send({ plan });
  });

  app.patch('/admin/subscriptions/plans/:planId', async (request) => {
    const { planId } = planParams.parse(request.params);
    return { plan: await updateAdminPlan(app, planId, planPatch.parse(request.body)) };
  });

  app.patch('/admin/subscriptions/clients/:clientId', async (request) => {
    const { clientId } = clientParams.parse(request.params);
    return { subscription: await updateAdminSubscription(app, clientId, subscriptionPatch.parse(request.body)) };
  });

  app.get('/admin/analytics', async (request) => {
    const { period } = analyticsQuery.parse(request.query);
    return { ...(await getAdminAnalytics(app, period)), source: 'api' };
  });

  app.get('/admin/settings', async () => getAdminSettings(app));
  app.patch('/admin/settings/:section', async () => notConfigured('Platform settings persistence'));
  app.post('/admin/settings/integrations/:integrationId/toggle', async () => notConfigured('Platform integrations'));
  app.post('/admin/settings/templates', async () => notConfigured('Platform reply templates'));
  app.patch('/admin/settings/templates/:templateId', async () => notConfigured('Platform reply templates'));
  app.delete('/admin/settings/templates/:templateId', async () => notConfigured('Platform reply templates'));
  app.post('/admin/settings/smtp/test', async () => notConfigured('SMTP provider'));
};
