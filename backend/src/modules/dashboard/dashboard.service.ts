import type { FastifyInstance } from 'fastify';

const DAY_MS = 86_400_000;
const ACTIVE_TASK_STATUSES = ['NEW', 'IN_PROGRESS', 'WAITING'] as const;

const TASK_PRIORITY_META: Readonly<Record<string, { label: string; tone: string }>> = Object.freeze({
  CRITICAL: { label: 'Критические', tone: 'purple' },
  HIGH: { label: 'Высокий приоритет', tone: 'violet' },
  MEDIUM: { label: 'Средний приоритет', tone: 'indigo' },
  LOW: { label: 'Низкий приоритет', tone: 'cyan' },
});

const TASK_STATUS_META: Readonly<Record<string, { status: string; badge: string; tone: string }>> = Object.freeze({
  NEW: { status: 'Новая', badge: 'neutral', tone: 'cyan' },
  IN_PROGRESS: { status: 'В работе', badge: 'violet', tone: 'violet' },
  WAITING: { status: 'Ожидает', badge: 'orange', tone: 'orange' },
  DONE: { status: 'Выполнено', badge: 'green', tone: 'green' },
  ARCHIVED: { status: 'Архив', badge: 'neutral', tone: 'neutral' },
});

const REPORT_STATUS_META: Readonly<Record<string, { status: string; size: string; tone: string }>> = Object.freeze({
  READY: { status: 'Готов', size: 'Готов', tone: 'violet' },
  GENERATING: { status: 'Формируется', size: 'Формируется', tone: 'orange' },
  QUEUED: { status: 'Формируется', size: 'В очереди', tone: 'orange' },
  FAILED: { status: 'Ошибка', size: 'Ошибка', tone: 'red' },
});

const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  OWNER: 'Владелец',
  ADMIN: 'Администратор',
  MANAGER: 'Менеджер',
  ANALYST: 'Аналитик',
  MEMBER: 'Участник',
});

export type DashboardOverviewAccess = {
  analytics: boolean;
  reviews: boolean;
  tasks: boolean;
  reports: boolean;
  team: boolean;
  integrations: boolean;
  billing?: boolean;
};

type TimelineRow = {
  receivedAt: Date;
  rating: number;
  answered: boolean;
};

type DailyPoint = {
  date: string;
  reviews: number;
  answered: number;
  averageRating: number | null;
};

type DashboardTaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  checklist: Array<{ completed: boolean }>;
};

function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function labelForDate(key: string, locale: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year || 1970, Math.max(0, (month || 1) - 1), day || 1, 12));
  return new Intl.DateTimeFormat(locale || 'ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function formatShortDate(date: Date | null | undefined, timezone: string, locale: string): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale || 'ru-RU', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildDailySeries(rows: TimelineRow[], timezone: string, days: number): DailyPoint[] {
  const map = new Map<string, { count: number; answered: number; ratingSum: number }>();
  for (const row of rows) {
    const key = dateKey(row.receivedAt, timezone);
    const current = map.get(key) ?? { count: 0, answered: 0, ratingSum: 0 };
    current.count += 1;
    current.answered += row.answered ? 1 : 0;
    current.ratingSum += row.rating;
    map.set(key, current);
  }

  const values: DailyPoint[] = [];
  const now = Date.now();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dateKey(new Date(now - offset * DAY_MS), timezone);
    const bucket = map.get(key) ?? { count: 0, answered: 0, ratingSum: 0 };
    values.push({
      date: key,
      reviews: bucket.count,
      answered: bucket.answered,
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

function rowsWithinDays(rows: TimelineRow[], days: number): TimelineRow[] {
  const cutoff = Date.now() - days * DAY_MS;
  return rows.filter((row) => row.receivedAt.getTime() >= cutoff);
}

function seriesGrowth(values: Array<number | null>): number {
  const numeric = values.filter((value): value is number => typeof value === 'number' && value > 0);
  if (numeric.length < 2) return 0;
  const first = numeric[0] ?? 0;
  const last = numeric.at(-1) ?? 0;
  return first > 0 ? Number((((last - first) / first) * 100).toFixed(1)) : 0;
}

function buildReviewsPeriod(rows: TimelineRow[], timezone: string, locale: string, days: number) {
  const series = buildDailySeries(rows, timezone, days);
  const total = series.reduce((sum, item) => sum + item.reviews, 0);
  const firstHalf = series.slice(0, Math.floor(series.length / 2)).reduce((sum, item) => sum + item.reviews, 0);
  const secondHalf = series.slice(Math.floor(series.length / 2)).reduce((sum, item) => sum + item.reviews, 0);
  const growth = firstHalf > 0 ? Number((((secondHalf - firstHalf) / firstHalf) * 100).toFixed(1)) : 0;
  return {
    dates: series.map((item) => item.date),
    labels: series.map((item) => labelForDate(item.date, locale)),
    received: series.map((item) => item.reviews),
    answered: series.map((item) => item.answered),
    total,
    growth,
  };
}

function buildRatingPeriod(
  rows: TimelineRow[],
  timezone: string,
  locale: string,
  days: number,
  allCurrent: number | null,
) {
  const periodRows = rowsWithinDays(rows, days);
  const series = buildDailySeries(periodRows, timezone, days);
  const positive = periodRows.filter((row) => row.rating >= 4).length;
  const answered = periodRows.filter((row) => row.answered).length;
  return {
    dates: series.map((item) => item.date),
    labels: series.map((item) => labelForDate(item.date, locale)),
    values: series.map((item) => item.averageRating ?? 0),
    current: allCurrent ?? 0,
    growth: seriesGrowth(series.map((item) => item.averageRating)),
    reviews: periodRows.length,
    totalReviews: rows.length,
    positive: percent(positive, periodRows.length),
    answered: percent(answered, periodRows.length),
  };
}

function buildTaskGroups(rows: DashboardTaskRow[], days: number, now: Date) {
  const cutoff = now.getTime() - days * DAY_MS;
  const groups = new Map<string, { id: string; label: string; total: number; completed: number; overdue: number; tone: string }>();

  for (const row of rows) {
    if (row.createdAt.getTime() < cutoff) continue;
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
    if (row.status === 'DONE' || row.status === 'ARCHIVED') group.completed += 1;
    if (!['DONE', 'ARCHIVED'].includes(row.status) && row.deadline && row.deadline < now) group.overdue += 1;
    groups.set(key, group);
  }

  const order = ['critical', 'high', 'medium', 'low'];
  return [...groups.values()].sort((left, right) => {
    const leftIndex = order.indexOf(left.id.replace('priority-', ''));
    const rightIndex = order.indexOf(right.id.replace('priority-', ''));
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  });
}

function taskProgress(task: DashboardTaskRow): number {
  if (task.status === 'DONE' || task.status === 'ARCHIVED') return 100;
  if (task.checklist.length) {
    const completed = task.checklist.filter((item) => item.completed).length;
    return Math.max(8, Math.round((completed / task.checklist.length) * 100));
  }
  if (task.status === 'IN_PROGRESS') return 62;
  if (task.status === 'WAITING') return 38;
  return 16;
}

function buildProcesses(rows: DashboardTaskRow[], locale: string, timezone: string) {
  return rows.slice(0, 4).map((task) => {
    const status = TASK_STATUS_META[task.status] ?? TASK_STATUS_META.NEW!;
    return {
      id: task.id,
      title: task.title,
      progress: taskProgress(task),
      date: formatShortDate(task.deadline ?? task.updatedAt, timezone, locale),
      status: status.status,
      badge: status.badge,
      tone: status.tone,
      priority: task.priority,
    };
  });
}

function buildReports(
  rows: Array<{ id: string; title: string; status: string; createdAt: Date; generatedAt: Date | null }>,
  locale: string,
  timezone: string,
  days: number,
) {
  const cutoff = Date.now() - days * DAY_MS;
  return rows
    .filter((report) => report.createdAt.getTime() >= cutoff)
    .slice(0, 6)
    .map((report) => ({
      id: report.id,
      title: report.title,
      date: formatShortDate(report.generatedAt ?? report.createdAt, timezone, locale),
      ...(REPORT_STATUS_META[report.status] ?? REPORT_STATUS_META.QUEUED),
    }));
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

export async function getDashboardOverview(
  app: FastifyInstance,
  organizationId: string,
  access: DashboardOverviewAccess = {
    analytics: false,
    reviews: false,
    tasks: false,
    reports: false,
    team: false,
    integrations: false,
    billing: false,
  },
) {
  const organization = await app.prisma.organization.findFirst({
    where: { id: organizationId, status: 'ACTIVE' },
    select: { id: true, timezone: true, locale: true },
  });

  if (!organization) return null;

  const now = new Date();
  const since1 = new Date(now.getTime() - DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since28 = new Date(now.getTime() - 28 * DAY_MS);
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
    timelineRaw,
    openTasks,
    overdueTasks,
    taskRows,
    reportRows,
    teamRows,
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
    app.prisma.review.count({ where: { organizationId, replies: { some: { status: 'PUBLISHED' } } } }),
    app.prisma.reviewSource.count({ where: { organizationId, status: 'ACTIVE' } }),
    access.analytics
      ? app.prisma.review.groupBy({ where: { organizationId }, by: ['rating'], _count: { _all: true } })
      : Promise.resolve([]),
    access.analytics
      ? app.prisma.review.groupBy({ where: { organizationId }, by: ['workflowStatus'], _count: { _all: true } })
      : Promise.resolve([]),
    access.analytics
      ? app.prisma.review.groupBy({ where: { organizationId }, by: ['sourceId'], _count: { _all: true } })
      : Promise.resolve([]),
    app.prisma.review.findMany({
      where: { organizationId, receivedAt: { gte: since365 } },
      select: {
        receivedAt: true,
        rating: true,
        replies: {
          where: { status: 'PUBLISHED' },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { receivedAt: 'asc' },
      take: 50_000,
    }),
    access.tasks
      ? app.prisma.task.count({ where: { organizationId, status: { in: [...ACTIVE_TASK_STATUSES] } } })
      : Promise.resolve(0),
    access.tasks
      ? app.prisma.task.count({
          where: {
            organizationId,
            status: { in: [...ACTIVE_TASK_STATUSES] },
            deadline: { lt: now },
          },
        })
      : Promise.resolve(0),
    access.tasks
      ? app.prisma.task.findMany({
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
        })
      : Promise.resolve([]),
    access.reports
      ? app.prisma.report.findMany({
          where: { organizationId, createdAt: { gte: since92 } },
          select: { id: true, title: true, status: true, generatedAt: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 100,
        })
      : Promise.resolve([]),
    access.team
      ? app.prisma.organizationMember.findMany({
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
        })
      : Promise.resolve([]),
    access.integrations
      ? app.prisma.integrationAccount.findMany({
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
        })
      : Promise.resolve([]),
    access.billing
      ? app.prisma.subscription.findFirst({
          where: { organizationId },
          select: {
            status: true,
            currentPeriodEnd: true,
            autoRenew: true,
            plan: { select: { code: true, name: true } },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve(null),
  ]);

  const timelineRows: TimelineRow[] = timelineRaw.map((row) => ({
    receivedAt: row.receivedAt,
    rating: row.rating,
    answered: row.replies.length > 0,
  }));

  const memberUserIds = teamRows.map((member) => member.user.id);
  const activeSessions = access.team && memberUserIds.length
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
  const connectedIntegrations = access.integrations
    ? integrationAccounts.filter((item) => item.status === 'CONNECTED' || item.status === 'DEGRADED').length
    : 0;

  const pulseScore = measured
    ? Math.round(
        Math.min(
          100,
          Math.max(0, ((averageRating ?? 0) / 5) * 55 + positiveShare * 0.25 + responseCoverage * 0.2),
        ),
      )
    : null;

  const sourceIds = access.analytics ? sourceDistribution.map((item) => item.sourceId) : [];
  const sources = sourceIds.length
    ? await app.prisma.reviewSource.findMany({
        where: { organizationId, id: { in: sourceIds } },
        select: { id: true, provider: true, name: true, status: true },
      })
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const pulseSeries = buildDailySeries(rowsWithinDays(timelineRows, 14), organization.timezone, 14);

  const team = access.team
    ? teamRows.map((member, index) => {
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
      })
    : [];

  return {
    contractVersion: 2,
    generatedAt: new Date().toISOString(),
    timezone: organization.timezone,
    measured,
    dataAvailability: {
      reviews: access.reviews && measured,
      analytics: access.analytics && measured,
      tasks: access.tasks,
      reports: access.reports,
      team: access.team,
      integrations: access.integrations,
      billing: Boolean(access.billing),
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
      tasks: access.tasks
        ? {
            value: openTasks,
            caption: overdueTasks ? `${overdueTasks} просрочено` : 'Без просроченных задач',
          }
        : null,
      shield: {
        active: activeSources > 0 || connectedIntegrations > 0,
        caption: activeSources
          ? `${activeSources} активных источников`
          : connectedIntegrations
            ? `${connectedIntegrations} интеграций подключено`
            : 'Источники не подключены',
      },
      subscription: access.billing
        ? {
            activeUntil: subscription?.currentPeriodEnd?.toISOString() ?? null,
            planName: subscription?.plan.name ?? '',
            planCode: subscription?.plan.code ?? '',
            status: subscription?.status.toLowerCase() ?? 'unknown',
            autoRenew: subscription?.autoRenew ?? false,
            connectedCount: connectedIntegrations,
            spark: [],
          }
        : null,
    },
    pulse: {
      measured,
      score: pulseScore,
      status: !measured ? 'Недостаточно данных' : pulseScore! >= 80 ? 'Сильная репутация' : pulseScore! >= 60 ? 'Стабильно' : 'Требует внимания',
      spark: pulseSeries.map((item) => item.reviews),
      signals: measured
        ? [
            { id: 'rating', label: 'Средняя оценка', value: averageRating?.toFixed(2) ?? '—', caption: 'из 5.0', tone: 'violet' },
            { id: 'positive', label: 'Позитивные', value: `${positiveShare}%`, caption: '4–5 звёзд', tone: 'green' },
            { id: 'coverage', label: 'Ответы', value: `${responseCoverage}%`, caption: 'с опубликованным ответом', tone: 'cyan' },
          ]
        : [],
    },
    reputation: access.analytics
      ? {
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
          timeline: buildDailySeries(timelineRows, organization.timezone, 28).map((item) => ({
            date: item.date,
            reviews: item.reviews,
            averageRating: item.averageRating,
          })),
        }
      : {},
    reviews: access.reviews
      ? {
          week: buildReviewsPeriod(timelineRows, organization.timezone, organization.locale, 7),
          month: buildReviewsPeriod(timelineRows, organization.timezone, organization.locale, 28),
        }
      : {},
    rating: access.analytics
      ? {
          week: buildRatingPeriod(timelineRows, organization.timezone, organization.locale, 7, averageRating),
          month: buildRatingPeriod(timelineRows, organization.timezone, organization.locale, 28, averageRating),
        }
      : {},
    tasks: access.tasks
      ? {
          open: openTasks,
          overdue: overdueTasks,
          week: buildTaskGroups(taskRows, 7, now),
          month: buildTaskGroups(taskRows, 31, now),
          quarter: buildTaskGroups(taskRows, 92, now),
        }
      : {},
    processes: access.tasks ? buildProcesses(taskRows, organization.locale, organization.timezone) : [],
    reports: access.reports
      ? {
          week: buildReports(reportRows, organization.locale, organization.timezone, 7),
          month: buildReports(reportRows, organization.locale, organization.timezone, 31),
          quarter: buildReports(reportRows, organization.locale, organization.timezone, 92),
        }
      : {},
    team,
    teamMeta: {
      total: team.length,
      online: team.filter((member) => member.status === 'online').length,
    },
    integrations: access.integrations
      ? integrationAccounts.map((account) => ({
          id: account.id,
          provider: account.provider,
          name: account.name,
          status: account.status,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
          lastErrorCode: account.lastErrorCode,
        }))
      : [],
  };
}
