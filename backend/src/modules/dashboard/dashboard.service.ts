import type { FastifyInstance } from 'fastify';

const DAY_MS = 86_400_000;
const ACTIVE_TASK_STATUSES = ['NEW', 'IN_PROGRESS', 'WAITING'] as const;

const TASK_PRIORITY_META: Readonly<Record<string, { label: string; tone: string }>> = Object.freeze({
  CRITICAL: { label: 'Критические', tone: 'purple' },
  HIGH: { label: 'Высокий приоритет', tone: 'violet' },
  MEDIUM: { label: 'Средний приоритет', tone: 'indigo' },
  LOW: { label: 'Низкий приоритет', tone: 'cyan' },
});

const TASK_STATUS_META: Readonly<Record<string, { label: string; badge: string; tone: string }>> = Object.freeze({
  NEW: { label: 'Новая', badge: 'neutral', tone: 'cyan' },
  IN_PROGRESS: { label: 'В работе', badge: 'violet', tone: 'violet' },
  WAITING: { label: 'Ожидает', badge: 'orange', tone: 'orange' },
  DONE: { label: 'Выполнено', badge: 'green', tone: 'green' },
  ARCHIVED: { label: 'Архив', badge: 'neutral', tone: 'neutral' },
});

const REPORT_STATUS_META: Readonly<Record<string, { label: string; tone: string }>> = Object.freeze({
  READY: { label: 'Готов', tone: 'violet' },
  GENERATING: { label: 'Формируется', tone: 'orange' },
  QUEUED: { label: 'В очереди', tone: 'gray' },
  FAILED: { label: 'Ошибка', tone: 'orange' },
});

const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  OWNER: 'Владелец',
  ADMIN: 'Администратор',
  MANAGER: 'Менеджер',
  ANALYST: 'Аналитик',
  MEMBER: 'Участник',
});

function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatShortDate(date: Date | null | undefined, timezone: string): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildDailySeries(
  rows: Array<{ receivedAt: Date; rating: number }>,
  timezone: string,
  days: number,
) {
  const map = new Map<string, { count: number; ratingSum: number }>();
  for (const row of rows) {
    const key = dateKey(row.receivedAt, timezone);
    const current = map.get(key) ?? { count: 0, ratingSum: 0 };
    current.count += 1;
    current.ratingSum += row.rating;
    map.set(key, current);
  }

  const values = [];
  const now = Date.now();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dateKey(new Date(now - offset * DAY_MS), timezone);
    const bucket = map.get(key) ?? { count: 0, ratingSum: 0 };
    values.push({
      date: key,
      reviews: bucket.count,
      averageRating: bucket.count ? Number((bucket.ratingSum / bucket.count).toFixed(2)) : null,
    });
  }
  return values;
}

function percent(part: number, total: number): number {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function roundRating(value: number | null | undefined): number | null {
  return typeof value === 'number' ? Number(value.toFixed(2)) : null;
}

function buildTaskGroups(
  rows: Array<{ status: string; priority: string; deadline: Date | null; createdAt: Date }>,
  since: Date,
  now: Date,
) {
  const groups = new Map<string, { id: string; label: string; total: number; completed: number; overdue: number; tone: string }>();

  for (const row of rows) {
    if (row.createdAt < since) continue;
    const meta = TASK_PRIORITY_META[row.priority] ?? { label: row.priority, tone: 'indigo' };
    const key = row.priority.toLowerCase();
    const group = groups.get(key) ?? {
      id: `priority-${key}`,
      label: meta.label,
      total: 0,
      completed: 0,
      overdue: 0,
      tone: meta.tone,
    };
    group.total += 1;
    if (row.status === 'DONE') group.completed += 1;
    if (row.status !== 'DONE' && row.status !== 'ARCHIVED' && row.deadline && row.deadline < now) group.overdue += 1;
    groups.set(key, group);
  }

  const order = ['critical', 'high', 'medium', 'low'];
  return [...groups.values()].sort((left, right) => order.indexOf(left.id.replace('priority-', '')) - order.indexOf(right.id.replace('priority-', '')));
}

function taskProgress(task: { status: string; checklist: Array<{ completed: boolean }> }): number {
  if (task.status === 'DONE') return 100;
  if (task.checklist.length) {
    const completed = task.checklist.filter((item) => item.completed).length;
    return Math.max(8, Math.round((completed / task.checklist.length) * 100));
  }
  if (task.status === 'IN_PROGRESS') return 62;
  if (task.status === 'WAITING') return 38;
  return 16;
}

function buildProcesses(
  rows: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    deadline: Date | null;
    updatedAt: Date;
    checklist: Array<{ completed: boolean }>;
  }>,
  timezone: string,
) {
  return rows.slice(0, 4).map((task) => {
    const status = TASK_STATUS_META[task.status] ?? TASK_STATUS_META.NEW!;
    return {
      id: task.id,
      title: task.title,
      progress: taskProgress(task),
      date: formatShortDate(task.deadline ?? task.updatedAt, timezone),
      status: status.label,
      badge: status.badge,
      tone: status.tone,
      priority: task.priority,
    };
  });
}

function normalizeReports(
  rows: Array<{ id: string; title: string; status: string; generatedAt: Date | null; createdAt: Date }>,
  since: Date,
  timezone: string,
) {
  return rows
    .filter((report) => report.createdAt >= since)
    .slice(0, 6)
    .map((report) => {
      const status = REPORT_STATUS_META[report.status] ?? { label: report.status, tone: 'gray' };
      return {
        id: report.id,
        title: report.title,
        date: formatShortDate(report.generatedAt ?? report.createdAt, timezone),
        size: '—',
        status: status.label,
        tone: status.tone,
      };
    });
}

function initials(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function presenceStatus(lastSeen: Date | null, lastLoginAt: Date | null, now: Date): 'online' | 'away' | 'offline' {
  if (lastSeen && now.getTime() - lastSeen.getTime() <= 15 * 60_000) return 'online';
  const activity = lastSeen ?? lastLoginAt;
  if (activity && now.getTime() - activity.getTime() <= 7 * DAY_MS) return 'away';
  return 'offline';
}

export async function getDashboardOverview(app: FastifyInstance, organizationId: string) {
  const organization = await app.prisma.organization.findFirst({
    where: { id: organizationId, status: 'ACTIVE' },
    select: { id: true, timezone: true, locale: true },
  });

  if (!organization) return null;

  const now = new Date();
  const since1 = new Date(now.getTime() - DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since28 = new Date(now.getTime() - 28 * DAY_MS);
  const since31 = new Date(now.getTime() - 31 * DAY_MS);
  const since92 = new Date(now.getTime() - 92 * DAY_MS);
  const since365 = new Date(now.getTime() - 365 * DAY_MS);

  const [
    aggregate,
    reviewsToday,
    reviews7,
    reviews28,
    reviewsYear,
    positive,
    negative,
    answered,
    activeSources,
    ratingDistribution,
    workflowDistribution,
    sourceDistribution,
    timelineRows,
    openTasks,
    overdueTasks,
    recentTasks,
    recentReports,
    members,
    integrationAccounts,
    subscription,
  ] = await Promise.all([
    app.prisma.review.aggregate({
      where: { organizationId },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    app.prisma.review.count({ where: { organizationId, receivedAt: { gte: since1 } } }),
    app.prisma.review.count({ where: { organizationId, receivedAt: { gte: since7 } } }),
    app.prisma.review.count({ where: { organizationId, receivedAt: { gte: since28 } } }),
    app.prisma.review.count({ where: { organizationId, receivedAt: { gte: since365 } } }),
    app.prisma.review.count({ where: { organizationId, rating: { gte: 4 } } }),
    app.prisma.review.count({ where: { organizationId, rating: { lte: 2 } } }),
    app.prisma.review.count({
      where: { organizationId, replies: { some: { status: 'PUBLISHED' } } },
    }),
    app.prisma.reviewSource.count({ where: { organizationId, status: 'ACTIVE' } }),
    app.prisma.review.groupBy({ where: { organizationId }, by: ['rating'], _count: { _all: true } }),
    app.prisma.review.groupBy({ where: { organizationId }, by: ['workflowStatus'], _count: { _all: true } }),
    app.prisma.review.groupBy({ where: { organizationId }, by: ['sourceId'], _count: { _all: true } }),
    app.prisma.review.findMany({
      where: { organizationId, receivedAt: { gte: since365 } },
      select: { receivedAt: true, rating: true },
      orderBy: { receivedAt: 'asc' },
      take: 50_000,
    }),
    app.prisma.task.count({ where: { organizationId, status: { in: [...ACTIVE_TASK_STATUSES] } } }),
    app.prisma.task.count({
      where: {
        organizationId,
        status: { in: [...ACTIVE_TASK_STATUSES] },
        deadline: { lt: now },
      },
    }),
    app.prisma.task.findMany({
      where: { organizationId, archivedAt: null, createdAt: { gte: since92 } },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        deadline: true,
        createdAt: true,
        updatedAt: true,
        checklist: { select: { completed: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 2_000,
    }),
    app.prisma.report.findMany({
      where: { organizationId, createdAt: { gte: since92 } },
      select: { id: true, title: true, status: true, generatedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    app.prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: now } }],
        user: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            email: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: [{ joinedAt: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    }),
    app.prisma.integrationAccount.findMany({
      where: { organizationId },
      select: {
        id: true,
        provider: true,
        name: true,
        status: true,
        lastSyncedAt: true,
        lastErrorCode: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    app.prisma.subscription.findFirst({
      where: { organizationId },
      select: {
        status: true,
        currentPeriodEnd: true,
        autoRenew: true,
        plan: { select: { code: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const memberUserIds = members.map((member) => member.user.id);
  const activeSessions = memberUserIds.length
    ? await app.prisma.session.findMany({
        where: {
          userId: { in: memberUserIds },
          activeOrganizationId: organizationId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { userId: true, lastSeenAt: true, createdAt: true },
      })
    : [];

  const latestSessionByUser = new Map<string, Date>();
  for (const session of activeSessions) {
    const seenAt = session.lastSeenAt ?? session.createdAt;
    const previous = latestSessionByUser.get(session.userId);
    if (!previous || seenAt > previous) latestSessionByUser.set(session.userId, seenAt);
  }

  const total = aggregate._count._all;
  const averageRating = roundRating(aggregate._avg.rating);
  const measured = total > 0;
  const positiveShare = percent(positive, total);
  const negativeShare = percent(negative, total);
  const responseCoverage = percent(answered, total);
  const connectedIntegrations = integrationAccounts.filter((item) => item.status === 'CONNECTED' || item.status === 'DEGRADED').length;

  const pulseScore = measured
    ? Math.round(
        Math.min(
          100,
          Math.max(
            0,
            ((averageRating ?? 0) / 5) * 55 + positiveShare * 0.25 + responseCoverage * 0.2,
          ),
        ),
      )
    : null;

  const sourceIds = sourceDistribution.map((item) => item.sourceId);
  const sources = sourceIds.length
    ? await app.prisma.reviewSource.findMany({
        where: { organizationId, id: { in: sourceIds } },
        select: { id: true, provider: true, name: true, status: true },
      })
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const timeline = buildDailySeries(timelineRows, organization.timezone, 28);
  const taskGroupsWeek = buildTaskGroups(recentTasks, since7, now);
  const taskGroupsMonth = buildTaskGroups(recentTasks, since31, now);
  const taskGroupsQuarter = buildTaskGroups(recentTasks, since92, now);
  const processes = buildProcesses(recentTasks, organization.timezone);
  const reportsMonth = normalizeReports(recentReports, since31, organization.timezone);
  const reportsQuarter = normalizeReports(recentReports, since92, organization.timezone);
  const team = members.map((member, index) => {
    const fullName = member.user.displayName
      || `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim()
      || member.user.email
      || 'Участник команды';
    const lastSeen = latestSessionByUser.get(member.user.id) ?? null;
    return {
      id: member.id,
      userId: member.user.id,
      initials: initials(fullName),
      name: fullName,
      role: ROLE_LABELS[member.role] ?? member.role,
      tone: ['violet', 'purple', 'orange', 'cyan'][index % 4],
      status: presenceStatus(lastSeen, member.user.lastLoginAt, now),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    timezone: organization.timezone,
    measured,
    dataAvailability: {
      reviews: measured,
      tasks: true,
      integrations: true,
      reports: true,
      team: true,
      billing: true,
    },
    metrics: {
      reviews: {
        value: total,
        byPeriod: { day: reviewsToday, week: reviews7, month: reviews28, year: reviewsYear, all: total },
        caption: total ? `${answered} опубликованных ответов` : 'Отзывов пока нет',
      },
      rating: {
        value: averageRating,
        caption: measured ? `${total} оценок` : 'Недостаточно данных',
      },
      tasks: {
        value: openTasks,
        caption: overdueTasks ? `${overdueTasks} просрочено` : 'Без просроченных задач',
      },
      shield: {
        active: activeSources > 0 || connectedIntegrations > 0,
        caption: activeSources
          ? `${activeSources} активных источников`
          : connectedIntegrations
            ? `${connectedIntegrations} интеграций подключено`
            : 'Источники не подключены',
      },
      subscription: {
        activeUntil: subscription?.currentPeriodEnd?.toISOString() ?? null,
        planName: subscription?.plan.name ?? '',
        planCode: subscription?.plan.code ?? '',
        status: subscription?.status.toLowerCase() ?? 'unknown',
        autoRenew: subscription?.autoRenew ?? false,
        connectedCount: connectedIntegrations,
        spark: [],
      },
    },
    pulse: {
      measured,
      score: pulseScore,
      status: !measured ? 'Недостаточно данных' : pulseScore! >= 80 ? 'Сильная репутация' : pulseScore! >= 60 ? 'Стабильно' : 'Требует внимания',
      signals: measured
        ? [
            { id: 'rating', label: 'Средняя оценка', value: averageRating },
            { id: 'positive', label: 'Позитивные', value: positiveShare },
            { id: 'coverage', label: 'Ответы', value: responseCoverage },
          ]
        : [],
    },
    reputation: {
      averageRating,
      totalReviews: total,
      positiveShare,
      negativeShare,
      answered,
      unanswered: Math.max(0, total - answered),
      responseCoverage,
      activeSources,
      ratingDistribution: ratingDistribution
        .map((item) => ({ rating: item.rating, count: item._count._all }))
        .sort((a, b) => a.rating - b.rating),
      workflowDistribution: workflowDistribution.map((item) => ({
        status: item.workflowStatus,
        count: item._count._all,
      })),
      sourceDistribution: sourceDistribution.map((item) => ({
        sourceId: item.sourceId,
        count: item._count._all,
        provider: sourceById.get(item.sourceId)?.provider ?? 'unknown',
        name: sourceById.get(item.sourceId)?.name ?? 'Источник',
        status: sourceById.get(item.sourceId)?.status ?? 'DISCONNECTED',
      })),
      timeline,
    },
    reviews: {
      month: {
        labels: timeline.map((item) => item.date),
        received: timeline.map((item) => item.reviews),
      },
    },
    rating: {
      month: {
        labels: timeline.map((item) => item.date),
        values: timeline.map((item) => item.averageRating ?? 0),
        current: averageRating ?? 0,
        reviews: reviews28,
        totalReviews: total,
        positive: positiveShare,
        answered: responseCoverage,
      },
    },
    tasks: {
      open: openTasks,
      overdue: overdueTasks,
      week: taskGroupsWeek,
      month: taskGroupsMonth,
      quarter: taskGroupsQuarter,
    },
    processes,
    reports: {
      month: reportsMonth,
      quarter: reportsQuarter,
    },
    team,
    teamMeta: {
      total: members.length,
      online: team.filter((member) => member.status === 'online').length,
    },
    integrations: integrationAccounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      name: account.name,
      status: account.status,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      lastErrorCode: account.lastErrorCode,
    })),
  };
}
