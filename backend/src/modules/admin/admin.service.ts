import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SubscriptionStatus } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { listAdminSupportTickets } from '../support/support.service.js';
import { ReportDeliveryError, sendReportEmail } from '../reports/report-delivery.service.js';

const PLATFORM_MANAGERS_METADATA_KEY = 'platform.admin.managers';
const PLATFORM_SETTINGS_METADATA_KEY = 'platform.admin.settings';
const PLATFORM_TEMPLATES_METADATA_KEY = 'platform.admin.reply-templates';

type PlatformManagerRecord = {
  userId: string;
  role: string;
  status: 'active' | 'training' | 'paused';
  capacity: number;
  rating: number;
};

async function readPlatformManagerRecords(app: FastifyInstance): Promise<PlatformManagerRecord[]> {
  const row = await app.prisma.serviceMetadata.findUnique({ where: { key: PLATFORM_MANAGERS_METADATA_KEY } });
  if (!row?.value || !Array.isArray(row.value)) return [];
  const records: PlatformManagerRecord[] = [];
  for (const value of row.value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const item = value as Record<string, unknown>;
    const userId = String(item.userId || '');
    if (!userId) continue;
    records.push({
      userId,
      role: String(item.role || 'Персональный менеджер'),
      status: ['active', 'training', 'paused'].includes(String(item.status))
        ? String(item.status) as PlatformManagerRecord['status']
        : 'active',
      capacity: Math.max(1, Math.min(30, Number(item.capacity || 6))),
      rating: Math.max(0, Math.min(5, Number(item.rating || 0))),
    });
  }
  return records;
}

async function writePlatformManagerRecords(app: FastifyInstance, records: PlatformManagerRecord[]) {
  await app.prisma.serviceMetadata.upsert({
    where: { key: PLATFORM_MANAGERS_METADATA_KEY },
    create: { key: PLATFORM_MANAGERS_METADATA_KEY, value: records },
    update: { value: records },
  });
}

function managerInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'МН';
}

export async function listPlatformManagers(app: FastifyInstance) {
  const records = await readPlatformManagerRecords(app);
  if (!records.length) return [];
  const users = await app.prisma.user.findMany({
    where: { id: { in: records.map((item) => item.userId) } },
    select: { id: true, displayName: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true, status: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  const openTickets = await app.prisma.supportTicket.groupBy({
    by: ['assignedToUserId'],
    where: { assignedToUserId: { in: records.map((item) => item.userId) }, status: { not: 'CLOSED' } },
    _count: { _all: true },
  });
  const ticketCounts = new Map(openTickets.map((item) => [item.assignedToUserId || '', item._count._all]));

  return records.flatMap((record) => {
    const user = byId.get(record.userId);
    if (!user) return [];
    const name = user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.phone || 'Менеджер';
    return [{
      id: user.id,
      initials: managerInitials(name),
      name,
      shortName: name.split(/\s+/)[0] || name,
      email: user.email || '',
      phone: user.phone || '',
      role: record.role,
      joinedAt: formatDate(user.createdAt),
      status: user.status === 'SUSPENDED' ? 'paused' : record.status,
      statusLabel: user.status === 'SUSPENDED' || record.status === 'paused' ? 'Приостановлен' : record.status === 'training' ? 'Обучение' : 'Активен',
      rating: record.rating,
      openTickets: ticketCounts.get(user.id) || 0,
      capacity: record.capacity,
    }];
  });
}

export async function isPlatformManagerUser(app: FastifyInstance, userId: string): Promise<boolean> {
  const records = await readPlatformManagerRecords(app);
  return records.some((item) => item.userId === userId && item.status === 'active');
}

export async function createPlatformManager(
  app: FastifyInstance,
  input: { name: string; email: string; phone: string; role: string; status: 'active' | 'training' | 'paused'; capacity: number; rating: number },
) {
  const existing = await app.prisma.user.findFirst({
    where: { OR: [{ email: { equals: input.email, mode: 'insensitive' } }, { phone: input.phone }] },
  });
  const [firstName, ...lastParts] = input.name.trim().split(/\s+/);
  const user = existing
    ? await app.prisma.user.update({
        where: { id: existing.id },
        data: {
          displayName: input.name,
          firstName: firstName || null,
          lastName: lastParts.join(' ') || null,
          email: input.email,
          phone: input.phone,
          status: input.status === 'paused' ? 'SUSPENDED' : 'ACTIVE',
        },
      })
    : await app.prisma.user.create({
        data: {
          displayName: input.name,
          firstName: firstName || null,
          lastName: lastParts.join(' ') || null,
          email: input.email,
          phone: input.phone,
          status: input.status === 'paused' ? 'SUSPENDED' : 'ACTIVE',
        },
      });

  const records = await readPlatformManagerRecords(app);
  if (records.some((item) => item.userId === user.id)) {
    throw new AppError({ code: 'ADMIN_MANAGER_ALREADY_EXISTS', message: 'Этот пользователь уже добавлен в platform-команду', statusCode: 409 });
  }
  await writePlatformManagerRecords(app, [...records, {
    userId: user.id,
    role: input.role,
    status: input.status,
    capacity: input.capacity,
    rating: input.rating,
  }]);
  const created = (await listPlatformManagers(app)).find((item) => item.id === user.id);
  if (!created) throw new AppError({ code: 'ADMIN_MANAGER_CREATE_FAILED', message: 'Не удалось прочитать созданного менеджера', statusCode: 500 });
  return created;
}

export async function updatePlatformManager(
  app: FastifyInstance,
  managerId: string,
  patch: {
    name?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    role?: string | undefined;
    status?: 'active' | 'training' | 'paused' | undefined;
    capacity?: number | undefined;
    rating?: number | undefined;
  },
) {
  const records = await readPlatformManagerRecords(app);
  const index = records.findIndex((item) => item.userId === managerId);
  if (index < 0) throw new AppError({ code: 'ADMIN_MANAGER_NOT_FOUND', message: 'Менеджер не найден', statusCode: 404 });

  const user = await app.prisma.user.findUnique({ where: { id: managerId } });
  if (!user) throw new AppError({ code: 'ADMIN_MANAGER_NOT_FOUND', message: 'Менеджер не найден', statusCode: 404 });
  const nextName = patch.name?.trim();
  const [firstName, ...lastParts] = nextName ? nextName.split(/\s+/) : [];
  await app.prisma.user.update({
    where: { id: managerId },
    data: {
      ...(nextName ? { displayName: nextName, firstName: firstName || null, lastName: lastParts.join(' ') || null } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.status !== undefined ? { status: patch.status === 'paused' ? 'SUSPENDED' : 'ACTIVE' } : {}),
    },
  });

  records[index] = {
    ...records[index]!,
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
    ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
  };
  await writePlatformManagerRecords(app, records);
  const updated = (await listPlatformManagers(app)).find((item) => item.id === managerId);
  if (!updated) throw new AppError({ code: 'ADMIN_MANAGER_UPDATE_FAILED', message: 'Не удалось прочитать обновлённого менеджера', statusCode: 500 });
  return updated;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  trial: 'Пробный',
  expired: 'Истёк',
  cancelled: 'Отменён',
  suspended: 'Приостановлен',
};

function formatDate(value: Date | null | undefined): string {
  return value ? new Intl.DateTimeFormat('ru-RU').format(value) : '—';
}

function initialsFor(name: string): string {
  const clean = name.replace(/[«»"']/g, '').replace(/^(ООО|ИП)\s+/u, '').trim();
  return clean.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'КЛ';
}

function subscriptionStatus(status: SubscriptionStatus | undefined, organizationStatus: string): string {
  if (organizationStatus === 'SUSPENDED') return 'suspended';
  if (organizationStatus === 'ARCHIVED') return 'cancelled';
  if (status === 'ACTIVE') return 'active';
  if (status === 'TRIALING') return 'trial';
  if (status === 'EXPIRED') return 'expired';
  return 'cancelled';
}

export async function listAdminClients(app: FastifyInstance) {
  const organizations = await app.prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      businesses: {
        where: { status: 'ACTIVE' },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        include: {
          locations: {
            where: { status: 'ACTIVE' },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
      },
      members: {
        where: { role: 'OWNER', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        include: { user: { select: { email: true, phone: true, firstName: true, lastName: true, displayName: true } } },
      },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: true },
      },
      _count: { select: { reviews: true, tasks: true, members: true } },
    },
  });

  const orgIds = organizations.map((item) => item.id);
  const ratingRows = orgIds.length
    ? await app.prisma.review.groupBy({ by: ['organizationId'], where: { organizationId: { in: orgIds } }, _avg: { rating: true } })
    : [];
  const ratingByOrganization = new Map(ratingRows.map((row) => [row.organizationId, row._avg.rating]));

  return organizations.map((organization) => {
    const business = organization.businesses[0];
    const location = business?.locations[0];
    const owner = organization.members[0]?.user;
    const subscription = organization.subscriptions[0];
    const plan = subscription?.plan;
    const status = subscriptionStatus(subscription?.status, organization.status);
    const name = organization.legalName || organization.name;
    const rating = ratingByOrganization.get(organization.id);

    return {
      id: organization.id,
      name,
      inn: organization.inn || '',
      legalForm: organization.legalType || '',
      city: location?.city || '',
      industry: organization.industry || business?.industry || '',
      email: owner?.email || '',
      phone: owner?.phone || '',
      planId: plan?.code?.toLowerCase() || '',
      plan: plan?.name || 'Без тарифа',
      status,
      statusLabel: STATUS_LABELS[status] || status,
      managerId: null,
      manager: '',
      managerName: '',
      managerInitials: '',
      revenue: subscription?.status === 'ACTIVE' ? Number(((plan?.priceCents || 0) / 100).toFixed(2)) : 0,
      rating: rating === null || rating === undefined ? null : Number(rating.toFixed(2)),
      startDate: formatDate(subscription?.currentPeriodStart || organization.createdAt),
      expiryDate: formatDate(subscription?.currentPeriodEnd),
      autoRenew: Boolean(subscription?.autoRenew),
      initials: initialsFor(name),
      tasks: organization._count.tasks,
      reviews: organization._count.reviews,
      tickets: 0,
      members: organization._count.members,
      onboardingStatus: organization.onboardingStatus,
      organizationStatus: organization.status,
    };
  });
}

export async function getAdminDashboard(app: FastifyInstance) {
  const clients = await listAdminClients(app);
  const active = clients.filter((item) => item.status === 'active');
  const trial = clients.filter((item) => item.status === 'trial');
  const mrr = active.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newClients = await app.prisma.organization.count({ where: { createdAt: { gte: monthStart } } });
  const renewable = [...active, ...trial];
  const autoRenewCount = renewable.filter((item) => item.autoRenew).length;
  const renewalRate = renewable.length ? Math.round((autoRenewCount / renewable.length) * 100) : null;
  const plans = await app.prisma.plan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } });
  const supportTickets = await listAdminSupportTickets(app);
  const openSupportTickets = supportTickets.filter((ticket) => ticket.status !== 'closed');

  return {
    measured: true,
    metrics: [
      { id: 'revenue', label: 'MRR по активным тарифам', value: `${mrr.toLocaleString('ru-RU')} ₽`, delta: 'текущий срез', tone: 'violet', direction: 'flat' },
      { id: 'clients', label: 'Активных клиентов', value: String(active.length), delta: `${clients.length} всего`, tone: 'purple', direction: 'flat' },
      { id: 'trials', label: 'Пробных клиентов', value: String(trial.length), delta: 'текущий срез', tone: 'blue', direction: 'flat' },
      { id: 'tickets', label: 'Тикеты поддержки', value: String(openSupportTickets.length), delta: `${supportTickets.length} всего`, tone: openSupportTickets.length ? 'orange' : 'green', direction: 'flat' },
      { id: 'newClients', label: 'Новых за месяц', value: String(newClients), delta: 'по дате регистрации', tone: 'orange', direction: 'flat' },
      { id: 'renewals', label: 'Автопродление', value: renewalRate === null ? '—' : `${renewalRate}%`, delta: renewalRate === null ? 'нет данных' : `${autoRenewCount} из ${renewable.length}`, tone: 'green', direction: 'flat' },
    ],
    revenue: { months: [], values: [], measured: false, reason: 'История платежей не подключена' },
    tariffs: plans.map((plan) => ({
      id: plan.code.toLowerCase(),
      label: plan.name,
      count: clients.filter((client) => client.planId === plan.code.toLowerCase()).length,
      tone: '#6b63f6',
    })),
    clients: clients.slice(0, 8).map((client) => ({
      id: client.id,
      initials: client.initials,
      name: client.name,
      meta: [client.plan, client.city].filter(Boolean).join(' · '),
      revenue: `${Number(client.revenue || 0).toLocaleString('ru-RU')} ₽`,
      status: client.statusLabel,
      tone: client.status === 'active' ? 'green' : client.status === 'trial' ? 'violet' : 'gray',
    })),
    tickets: supportTickets.slice(0, 8),
    managers: [],
    supportConfigured: true,
  };
}

export async function getAdminAnalytics(app: FastifyInstance, period: string) {
  const clients = await listAdminClients(app);
  const active = clients.filter((item) => item.status === 'active');
  const mrr = active.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const arpu = active.length ? Math.round(mrr / active.length) : 0;

  const sourceRows = await app.prisma.review.groupBy({
    by: ['sourceId'],
    _count: { _all: true },
    _avg: { rating: true },
  });
  const sourceIds = sourceRows.map((row) => row.sourceId);
  const sources = sourceIds.length
    ? await app.prisma.reviewSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true, provider: true } })
    : [];
  const sourceById = new Map(sources.map((item) => [item.id, item]));
  const publishedReplies = sourceIds.length
    ? await app.prisma.reviewReply.findMany({
        where: { status: 'PUBLISHED', review: { sourceId: { in: sourceIds } } },
        select: { reviewId: true, review: { select: { sourceId: true } } },
        distinct: ['reviewId'],
      })
    : [];
  const answeredCountBySource = new Map<string, number>();
  for (const item of publishedReplies) {
    const sourceId = item.review.sourceId;
    answeredCountBySource.set(sourceId, (answeredCountBySource.get(sourceId) || 0) + 1);
  }

  return {
    period,
    measured: true,
    metrics: [
      { id: 'mrr', label: 'MRR', value: `${mrr.toLocaleString('ru-RU')} ₽`, delta: 'текущий срез', direction: 'flat', tone: 'violet' },
      { id: 'clients', label: 'Клиентов', value: String(clients.length), delta: `${active.length} активных`, direction: 'flat', tone: 'cyan' },
      { id: 'inactive', label: 'Неактивных', value: String(clients.length - active.length), delta: 'текущий срез', direction: 'flat', tone: 'orange' },
      { id: 'arpu', label: 'ARPU активных', value: `${arpu.toLocaleString('ru-RU')} ₽`, delta: 'по текущему MRR', direction: 'flat', tone: 'magenta' },
    ],
    months: [],
    mrr: [],
    newClients: [],
    churnClients: [],
    churnRate: [],
    plans: {},
    historyMeasured: false,
    platforms: sourceRows.map((row) => {
      const source = sourceById.get(row.sourceId);
      const reviews = row._count._all;
      const replies = answeredCountBySource.get(row.sourceId) || 0;
      return {
        id: row.sourceId,
        name: source?.name || source?.provider || 'Источник',
        provider: source?.provider || '',
        reviews,
        replies,
        coverage: reviews ? Math.round((replies / reviews) * 100) : 0,
        rating: row._avg.rating === null ? null : Number(row._avg.rating.toFixed(2)),
        trend: null,
      };
    }).sort((a, b) => b.reviews - a.reviews),
    insights: [],
  };
}

export async function getAdminSubscriptions(app: FastifyInstance) {
  const [clients, plans, subscriptions] = await Promise.all([
    listAdminClients(app),
    app.prisma.plan.findMany({ where: { active: true }, include: { entitlements: true }, orderBy: { priceCents: 'asc' } }),
    app.prisma.subscription.findMany({ include: { organization: true, plan: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
  ]);

  const subscriptionRows = subscriptions.map((subscription) => ({
    id: subscription.id,
    clientId: subscription.organizationId,
    clientName: subscription.organization.legalName || subscription.organization.name,
    initials: initialsFor(subscription.organization.legalName || subscription.organization.name),
    planId: subscription.plan.code.toLowerCase(),
    planName: subscription.plan.name,
    status: subscriptionStatus(subscription.status, subscription.organization.status),
    statusLabel: STATUS_LABELS[subscriptionStatus(subscription.status, subscription.organization.status)],
    startDate: formatDate(subscription.currentPeriodStart || subscription.createdAt),
    expiryDate: formatDate(subscription.currentPeriodEnd),
    renewalDate: formatDate(subscription.currentPeriodEnd),
    revenue: subscription.status === 'ACTIVE' ? Number((subscription.plan.priceCents / 100).toFixed(2)) : 0,
    autoRenew: subscription.autoRenew,
    provider: subscription.provider,
    managerName: '',
    rating: clients.find((client) => client.id === subscription.organizationId)?.rating ?? null,
  }));

  const currentByOrganization = new Map<string, typeof subscriptionRows[number]>();
  for (const row of subscriptionRows) {
    if (!currentByOrganization.has(row.clientId)) currentByOrganization.set(row.clientId, row);
  }
  const current = [...currentByOrganization.values()];
  const active = current.filter((item) => item.status === 'active');
  const renewable = current.filter((item) => ['active', 'trial'].includes(item.status));
  const mrr = active.reduce((sum, item) => sum + Number(item.revenue || 0), 0);

  return {
    plans: plans.map((plan) => ({
      id: plan.code.toLowerCase(),
      backendId: plan.id,
      name: plan.name,
      price: Number((plan.priceCents / 100).toFixed(2)),
      currency: plan.currency,
      active: plan.active,
      clients: current.filter((item) => item.planId === plan.code.toLowerCase()).length,
      activeClients: active.filter((item) => item.planId === plan.code.toLowerCase()).length,
      mrr: active.filter((item) => item.planId === plan.code.toLowerCase()).reduce((sum, item) => sum + Number(item.revenue || 0), 0),
      entitlements: Object.fromEntries(plan.entitlements.map((item) => [item.key, item.value])),
    })),
    subscriptions: current,
    renewals: renewable.filter((item) => item.expiryDate !== '—').sort((a, b) => a.expiryDate.localeCompare(b.expiryDate, 'ru')).slice(0, 25),
    events: [],
    metrics: {
      mrr,
      arr: mrr * 12,
      active: active.length,
      expiringSoon: renewable.filter((item) => item.expiryDate !== '—').length,
      manualRenewals: renewable.filter((item) => !item.autoRenew).length,
      atRisk: current.filter((item) => item.rating !== null && Number(item.rating) < 3.5).length,
      renewalRate: renewable.length ? Math.round((renewable.filter((item) => item.autoRenew).length / renewable.length) * 100) : null,
    },
    paymentHistoryConfigured: false,
  };
}

export async function updateAdminPlan(
  app: FastifyInstance,
  planCode: string,
  patch: { name?: string | undefined; price?: number | undefined; active?: boolean | undefined },
) {
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planCode);
  const plan = looksLikeUuid
    ? await app.prisma.plan.findFirst({ where: { OR: [{ id: planCode }, { code: planCode.toUpperCase() }] } })
    : await app.prisma.plan.findFirst({ where: { code: planCode.toUpperCase() } });
  if (!plan) throw new AppError({ code: 'PLAN_NOT_FOUND', message: 'Тариф не найден', statusCode: 404 });
  return app.prisma.plan.update({
    where: { id: plan.id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.price !== undefined ? { priceCents: Math.round(patch.price * 100) } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    },
  });
}

export async function createAdminPlan(
  app: FastifyInstance,
  input: { code: string; name: string; price: number; currency?: string | undefined },
) {
  return app.prisma.plan.create({
    data: {
      code: input.code.toUpperCase(),
      name: input.name,
      priceCents: Math.round(input.price * 100),
      currency: input.currency || 'RUB',
      active: true,
    },
  });
}

export async function updateAdminSubscription(
  app: FastifyInstance,
  organizationId: string,
  patch: { autoRenew?: boolean | undefined },
) {
  const subscription = await app.prisma.subscription.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
  if (!subscription) throw new AppError({ code: 'SUBSCRIPTION_NOT_FOUND', message: 'Подписка не найдена', statusCode: 404 });
  return app.prisma.subscription.update({
    where: { id: subscription.id },
    data: { ...(patch.autoRenew !== undefined ? { autoRenew: patch.autoRenew } : {}) },
  });
}

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

async function readMetadataRecord(app: FastifyInstance, key: string): Promise<JsonRecord> {
  const row = await app.prisma.serviceMetadata.findUnique({ where: { key } });
  return asJsonRecord(row?.value);
}

async function writeMetadataRecord(app: FastifyInstance, key: string, value: JsonRecord) {
  await app.prisma.serviceMetadata.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

async function readAdminTemplates(app: FastifyInstance): Promise<JsonRecord[]> {
  const row = await app.prisma.serviceMetadata.findUnique({ where: { key: PLATFORM_TEMPLATES_METADATA_KEY } });
  if (!row?.value || !Array.isArray(row.value)) return [];
  return row.value.flatMap((value) => value && typeof value === 'object' && !Array.isArray(value)
    ? [value as JsonRecord]
    : []);
}

async function writeAdminTemplates(app: FastifyInstance, templates: JsonRecord[]) {
  await app.prisma.serviceMetadata.upsert({
    where: { key: PLATFORM_TEMPLATES_METADATA_KEY },
    create: { key: PLATFORM_TEMPLATES_METADATA_KEY, value: templates },
    update: { value: templates },
  });
}

export async function getAdminSettings(app: FastifyInstance) {
  const [subscriptions, stored, templates, managers] = await Promise.all([
    getAdminSubscriptions(app),
    readMetadataRecord(app, PLATFORM_SETTINGS_METADATA_KEY),
    readAdminTemplates(app),
    listPlatformManagers(app),
  ]);
  const storedIntegrations = Array.isArray(stored.integrations) ? stored.integrations : [];
  const reportEmailConfigured = env.REPORT_EMAIL_PROVIDER !== 'disabled';

  return {
    notifications: asJsonRecord(stored.notifications),
    smtp: {
      ...asJsonRecord(stored.smtp),
      provider: env.REPORT_EMAIL_PROVIDER,
      configured: reportEmailConfigured,
      from: env.REPORT_EMAIL_FROM || '',
    },
    integrations: storedIntegrations,
    templates,
    security: {
      ...asJsonRecord(stored.security),
      platformAdminAllowlistConfigured: env.PLATFORM_ADMIN_IDENTITIES.length > 0 || managers.length > 0,
      otpProvider: 'configured-by-environment',
      swagger: env.SWAGGER_ENABLED,
    },
    securityLog: [],
    plans: subscriptions.plans,
    source: 'api',
    capabilities: {
      smtp: reportEmailConfigured,
      platformIntegrations: true,
      supportTickets: true,
      supportManagers: true,
      replyTemplates: true,
      settingsPersistence: true,
    },
  };
}

export async function updateAdminSettingsSection(
  app: FastifyInstance,
  section: 'notifications' | 'smtp' | 'security',
  value: JsonRecord,
) {
  const stored = await readMetadataRecord(app, PLATFORM_SETTINGS_METADATA_KEY);
  stored[section] = value;
  await writeMetadataRecord(app, PLATFORM_SETTINGS_METADATA_KEY, stored);
  return { section, value };
}

export async function toggleAdminPlatformIntegration(
  app: FastifyInstance,
  integrationId: string,
  enabled: boolean,
) {
  const stored = await readMetadataRecord(app, PLATFORM_SETTINGS_METADATA_KEY);
  const integrations = Array.isArray(stored.integrations)
    ? stored.integrations.flatMap((value) => value && typeof value === 'object' && !Array.isArray(value)
      ? [value as JsonRecord]
      : [])
    : [];
  const index = integrations.findIndex((item) => String(item.id || '') === integrationId);
  const next = {
    ...(index >= 0 ? integrations[index] : {}),
    id: integrationId,
    enabled,
    status: enabled ? 'enabled' : 'disabled',
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) integrations[index] = next;
  else integrations.push(next);
  stored.integrations = integrations;
  await writeMetadataRecord(app, PLATFORM_SETTINGS_METADATA_KEY, stored);
  return next;
}

export async function createAdminReplyTemplate(app: FastifyInstance, input: JsonRecord) {
  const templates = await readAdminTemplates(app);
  const template = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeAdminTemplates(app, [...templates, template]);
  return template;
}

export async function updateAdminReplyTemplate(app: FastifyInstance, templateId: string, patch: JsonRecord) {
  const templates = await readAdminTemplates(app);
  const index = templates.findIndex((item) => String(item.id || '') === templateId);
  if (index < 0) throw new AppError({ code: 'ADMIN_TEMPLATE_NOT_FOUND', message: 'Шаблон ответа не найден', statusCode: 404 });
  const template = {
    ...templates[index],
    ...patch,
    id: templateId,
    updatedAt: new Date().toISOString(),
  };
  templates[index] = template;
  await writeAdminTemplates(app, templates);
  return template;
}

export async function deleteAdminReplyTemplate(app: FastifyInstance, templateId: string) {
  const templates = await readAdminTemplates(app);
  if (!templates.some((item) => String(item.id || '') === templateId)) {
    throw new AppError({ code: 'ADMIN_TEMPLATE_NOT_FOUND', message: 'Шаблон ответа не найден', statusCode: 404 });
  }
  await writeAdminTemplates(app, templates.filter((item) => String(item.id || '') !== templateId));
}

export async function testAdminEmailProvider(app: FastifyInstance, userId: string) {
  const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const email = String(user?.email || '').trim();
  if (!email) throw new AppError({ code: 'ADMIN_EMAIL_REQUIRED', message: 'У администратора не указан email для тестовой отправки', statusCode: 400 });
  if (env.REPORT_EMAIL_PROVIDER === 'disabled') {
    throw new AppError({ code: 'REPORT_EMAIL_PROVIDER_NOT_CONFIGURED', message: 'Email provider не настроен', statusCode: 503 });
  }
  const eventId = `bs-admin-email-test-${randomUUID()}`;
  try {
    await sendReportEmail(
      email,
      'Бизнес Щит · проверка email provider',
      'Тестовая отправка из Platform Admin выполнена успешно.',
      eventId,
    );
  } catch (error) {
    if (error instanceof ReportDeliveryError) {
      throw new AppError({
        code: 'ADMIN_EMAIL_TEST_FAILED',
        message: error.message,
        statusCode: error.retryable ? 503 : 502,
      });
    }
    throw error;
  }
  return { ok: true, provider: env.REPORT_EMAIL_PROVIDER, destination: email };
}


function normalizedPhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return trimmed;
}

function adminClientSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'client';
  return `${base}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseAdminExpiryDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createAdminClient(
  app: FastifyInstance,
  input: {
    name: string;
    inn: string;
    email: string;
    phone: string;
    planId: string;
    status: 'active' | 'trial' | 'expired' | 'cancelled';
    city?: string | undefined;
    industry?: string | undefined;
    expiryDate?: string | undefined;
  },
) {
  const phone = normalizedPhone(input.phone);
  if (!phone) throw new AppError({ code: 'ADMIN_CLIENT_PHONE_REQUIRED', message: 'Для владельца клиента требуется телефон', statusCode: 400 });

  const plan = await app.prisma.plan.findFirst({
    where: { OR: [{ code: input.planId.toUpperCase() }, { id: input.planId }] },
  });
  if (!plan) throw new AppError({ code: 'PLAN_NOT_FOUND', message: 'Тариф не найден', statusCode: 404 });

  const existingOwner = await app.prisma.user.findFirst({
    where: { OR: [{ email: { equals: input.email, mode: 'insensitive' } }, { phone }] },
  });
  if (existingOwner) {
    throw new AppError({ code: 'ADMIN_CLIENT_OWNER_ALREADY_EXISTS', message: 'Пользователь с таким email или телефоном уже существует', statusCode: 409 });
  }

  const subscriptionStatus = input.status === 'active' ? 'ACTIVE'
    : input.status === 'trial' ? 'TRIALING'
      : input.status === 'expired' ? 'EXPIRED'
        : 'CANCELED';
  const organizationStatus = input.status === 'cancelled' ? 'ARCHIVED' : 'ACTIVE';
  const expiry = parseAdminExpiryDate(input.expiryDate);

  return app.prisma.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: { email: input.email, phone, displayName: input.name, status: 'ACTIVE' },
    });
    const organization = await tx.organization.create({
      data: {
        name: input.name,
        legalName: input.name,
        slug: adminClientSlug(input.name),
        inn: input.inn,
        industry: input.industry || null,
        status: organizationStatus,
        onboardingStatus: 'NOT_STARTED',
      },
    });
    await tx.organizationMember.create({
      data: { organizationId: organization.id, userId: owner.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
    });
    const business = await tx.business.create({
      data: { organizationId: organization.id, name: input.name, industry: input.industry || null, isPrimary: true },
    });
    if (input.city) {
      await tx.location.create({
        data: { businessId: business.id, name: input.city, city: input.city, isPrimary: true },
      });
    }
    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: plan.id,
        status: subscriptionStatus,
        autoRenew: input.status === 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: expiry,
      },
    });
    return organization;
  });
}
