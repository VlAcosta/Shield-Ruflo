import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import {
  createAdminClient,
  createAdminPlan,
  createAdminReplyTemplate,
  createPlatformManager,
  deleteAdminReplyTemplate,
  getAdminAnalytics,
  getAdminDashboard,
  getAdminSettings,
  getAdminSubscriptions,
  isPlatformManagerUser,
  listAdminClients,
  listPlatformManagers,
  testAdminEmailProvider,
  toggleAdminPlatformIntegration,
  updateAdminPlan,
  updateAdminReplyTemplate,
  updateAdminSettingsSection,
  updateAdminSubscription,
  updatePlatformManager,
} from './admin.service.js';
import {
  addAdminSupportMessage,
  listAdminSupportTickets,
  updateAdminSupportTicket,
} from '../support/support.service.js';

const clientParams = z.object({ clientId: z.string().uuid() });
const planParams = z.object({ planId: z.string().min(1).max(120) });
const analyticsQuery = z.object({ period: z.enum(['month', 'quarter', 'year']).default('month') });
const clientCreate = z.object({
  name: z.string().trim().min(3).max(240),
  inn: z.string().trim().regex(/^\d{10,12}$/),
  email: z.string().trim().email(),
  phone: z.string().trim().min(5).max(64),
  planId: z.string().trim().min(1).max(120),
  managerId: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'trial', 'expired', 'cancelled']).default('active'),
  city: z.string().trim().max(160).optional(),
  industry: z.string().trim().max(120).optional(),
  expiryDate: z.string().trim().max(20).optional(),
}).strict();
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
const managerCreate = z.object({
  name: z.string().trim().min(2).max(180),
  email: z.string().trim().email(),
  phone: z.string().trim().min(5).max(64),
  role: z.string().trim().min(1).max(160).default('Персональный менеджер'),
  status: z.enum(['active', 'training', 'paused']).default('active'),
  capacity: z.coerce.number().int().min(1).max(30).default(6),
  rating: z.coerce.number().min(0).max(5).default(0),
  openTickets: z.coerce.number().int().min(0).max(10_000).optional(),
}).strict();
const managerPatch = managerCreate.partial().strict();
const managerParams = z.object({ managerId: z.string().uuid() });
const settingsSectionParams = z.object({ section: z.enum(['notifications', 'smtp', 'security']) });
const integrationParams = z.object({ integrationId: z.string().trim().min(1).max(120) });
const integrationToggle = z.object({ enabled: z.boolean() }).strict();
const templateParams = z.object({ templateId: z.string().uuid() });
const jsonRecord = z.record(z.string(), z.unknown());
const replyTemplateCreate = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  title: z.string().trim().min(1).max(180).optional(),
  body: z.string().max(20_000).optional(),
  text: z.string().max(20_000).optional(),
  tone: z.string().trim().max(80).optional(),
  enabled: z.boolean().optional(),
}).passthrough().refine((value) => Boolean(value.name || value.title), { message: 'Укажите название шаблона' })
  .refine((value) => Boolean(value.body || value.text), { message: 'Укажите текст шаблона' });
const replyTemplatePatch = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  title: z.string().trim().min(1).max(180).optional(),
  body: z.string().max(20_000).optional(),
  text: z.string().max(20_000).optional(),
  tone: z.string().trim().max(80).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

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
  const bootstrapAllowed = env.PLATFORM_ADMIN_IDENTITIES.length > 0
    && env.PLATFORM_ADMIN_IDENTITIES.some((identity) => identities.has(identity));
  const persistedAllowed = await isPlatformManagerUser(app, user.id);

  if (!bootstrapAllowed && !persistedAllowed) {
    request.log.warn({ userId: user.id }, 'Denied platform admin access');
    throw new AppError({ code: 'PLATFORM_ADMIN_ACCESS_DENIED', message: 'Доступ к панели администратора запрещён', statusCode: 403 });
  }
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

  app.post('/admin/clients', async (request, reply) => {
    const organization = await createAdminClient(app, clientCreate.parse(request.body));
    const clients = await listAdminClients(app);
    const client = clients.find((item) => item.id === organization.id);
    return reply.code(201).send({ client });
  });

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
  app.post('/admin/managers', async (request, reply) => {
    const manager = await createPlatformManager(app, managerCreate.parse(request.body));
    return reply.code(201).send({ manager });
  });
  app.patch('/admin/managers/:managerId', async (request) => {
    const { managerId } = managerParams.parse(request.params);
    const patch = managerPatch.parse(request.body);
    return {
      manager: await updatePlatformManager(app, managerId, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
        ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
      }),
    };
  });

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
      ...(body.internal !== undefined ? { internal: body.internal } : {}),
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

  app.patch('/admin/settings/:section', async (request) => {
    const { section } = settingsSectionParams.parse(request.params);
    const value = jsonRecord.parse(request.body);
    return updateAdminSettingsSection(app, section, value);
  });

  app.post('/admin/settings/integrations/:integrationId/toggle', async (request) => {
    const { integrationId } = integrationParams.parse(request.params);
    const { enabled } = integrationToggle.parse(request.body);
    return { integration: await toggleAdminPlatformIntegration(app, integrationId, enabled) };
  });

  app.post('/admin/settings/templates', async (request, reply) => {
    const template = await createAdminReplyTemplate(app, replyTemplateCreate.parse(request.body));
    return reply.code(201).send({ template });
  });

  app.patch('/admin/settings/templates/:templateId', async (request) => {
    const { templateId } = templateParams.parse(request.params);
    return { template: await updateAdminReplyTemplate(app, templateId, replyTemplatePatch.parse(request.body)) };
  });

  app.delete('/admin/settings/templates/:templateId', async (request, reply) => {
    const { templateId } = templateParams.parse(request.params);
    await deleteAdminReplyTemplate(app, templateId);
    return reply.code(204).send();
  });

  app.post('/admin/settings/smtp/test', async (request) => testAdminEmailProvider(app, request.auth!.userId));
};
