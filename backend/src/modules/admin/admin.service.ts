import type { FastifyInstance } from 'fastify';
import type { SubscriptionStatus } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';

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

  return {
    measured: true,
    metrics: [
      { id: 'revenue', label: 'MRR по активным тарифам', value: `${mrr.toLocaleString('ru-RU')} ₽`, delta: 'текущий срез', tone: 'violet', direction: 'flat' },
      { id: 'clients', label: 'Активных клиентов', value: String(active.length), delta: `${clients.length} всего`, tone: 'purple', direction: 'flat' },
      { id: 'trials', label: 'Пробных клиентов', value: String(trial.length), delta: 'текущий срез', tone: 'blue', direction: 'flat' },
      { id: 'tickets', label: 'Тикеты поддержки', value: '—', delta: 'модуль не настроен', tone: 'gray', direction: 'flat' },
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
    tickets: [],
    managers: [],
    supportConfigured: false,
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

export async function getAdminSettings(app: FastifyInstance) {
  const subscriptions = await getAdminSubscriptions(app);
  return {
    notifications: {},
    smtp: { configured: false },
    integrations: [],
    templates: [],
    security: {
      platformAdminAllowlistConfigured: true,
      otpProvider: 'configured-by-environment',
      swagger: false,
    },
    securityLog: [],
    plans: subscriptions.plans,
    source: 'api',
    capabilities: {
      smtp: false,
      platformIntegrations: false,
      supportTickets: false,
      supportManagers: false,
      replyTemplates: false,
    },
  };
}
