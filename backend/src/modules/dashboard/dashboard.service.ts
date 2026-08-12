import type { FastifyInstance } from 'fastify';

const DAY_MS = 86_400_000;

export type DashboardOverviewAccess = {
  analytics: boolean;
  reviews: boolean;
  tasks: boolean;
  reports: boolean;
  team: boolean;
  integrations: boolean;
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

function buildDailySeries(
  rows: TimelineRow[],
  timezone: string,
  days: number,
): DailyPoint[] {
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

function taskGroupLabel(task: {
  reviewId: string | null;
  caseId: string | null;
  locationId: string | null;
  businessId: string | null;
}) {
  if (task.reviewId) return 'Отзывы';
  if (task.caseId) return 'Кейсы';
  if (task.locationId) return 'Локации';
  if (task.businessId) return 'Бизнес';
  return 'Общие';
}

function buildTaskGroups(
  rows: Array<{
    reviewId: string | null;
    caseId: string | null;
    locationId: string | null;
    businessId: string | null;
    status: string;
    deadline: Date | null;
    createdAt: Date;
  }>,
  days: number,
) {
  const cutoff = Date.now() - days * DAY_MS;
  const source = rows.filter((task) => task.createdAt.getTime() >= cutoff);
  const byType = new Map<string, { id: string; label: string; total: number; completed: number; overdue: number }>();
  for (const task of source) {
    const label = taskGroupLabel(task);
    const current = byType.get(label) ?? {
      id: label.toLocaleLowerCase('ru-RU').replace(/\s+/g, '-'),
      label,
      total: 0,
      completed: 0,
      overdue: 0,
    };
    current.total += 1;
    if (task.status === 'DONE' || task.status === 'ARCHIVED') current.completed += 1;
    if (!['DONE', 'ARCHIVED'].includes(task.status) && task.deadline && task.deadline.getTime() < Date.now()) current.overdue += 1;
    byType.set(label, current);
  }
  const tones = ['indigo', 'violet', 'purple', 'indigo', 'violet'];
  return [...byType.values()].slice(0, 8).map((item, index) => ({ ...item, tone: tones[index % tones.length] }));
}

function taskProgress(status: string): number {
  if (status === 'DONE' || status === 'ARCHIVED') return 100;
  if (status === 'IN_PROGRESS') return 62;
  if (status === 'WAITING') return 38;
  return 16;
}

function buildProcesses(
  rows: Array<{ id: string; title: string; status: string; deadline: Date | null; createdAt: Date }>,
  locale: string,
  timezone: string,
) {
  const statusMeta: Record<string, { status: string; badge: string; tone: string }> = {
    DONE: { status: 'Выполнено', badge: 'green', tone: 'green' },
    ARCHIVED: { status: 'Выполнено', badge: 'green', tone: 'green' },
    IN_PROGRESS: { status: 'В работе', badge: 'violet', tone: 'violet' },
    WAITING: { status: 'Ожидает', badge: 'orange', tone: 'orange' },
    NEW: { status: 'Новая', badge: 'neutral', tone: 'cyan' },
  };
  return rows.slice(0, 4).map((task) => ({
    id: task.id,
    title: task.title,
    progress: taskProgress(task.status),
    date: new Intl.DateTimeFormat(locale || 'ru-RU', { timeZone: timezone }).format(task.deadline ?? task.createdAt),
    ...(statusMeta[task.status] ?? statusMeta.NEW),
  }));
}

function buildReports(
  rows: Array<{ id: string; title: string; status: string; createdAt: Date; generatedAt: Date | null }>,
  locale: string,
  timezone: string,
  days: number,
) {
  const cutoff = Date.now() - days * DAY_MS;
  const statusMeta: Record<string, { status: string; size: string; tone: string }> = {
    READY: { status: 'Готов', size: 'Готов', tone: 'violet' },
    GENERATING: { status: 'Формируется', size: 'Формируется', tone: 'orange' },
    QUEUED: { status: 'Формируется', size: 'В очереди', tone: 'orange' },
    FAILED: { status: 'Ошибка', size: 'Ошибка', tone: 'red' },
  };
  return rows
    .filter((report) => report.createdAt.getTime() >= cutoff)
    .slice(0, 6)
    .map((report) => ({
      id: report.id,
      title: report.title,
      date: new Intl.DateTimeFormat(locale || 'ru-RU', { timeZone: timezone }).format(report.generatedAt ?? report.createdAt),
      ...(statusMeta[report.status] ?? statusMeta.QUEUED),
    }));
}

function memberInitials(member: { displayName: string | null; firstName: string | null; lastName: string | null; email: string | null }) {
  const source = String(member.displayName || `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? '?'}${parts[1]?.[0] ?? ''}`.toLocaleUpperCase('ru-RU');
}

function normalizeTeam(
  rows: Array<{
    id: string;
    role: string;
    user: {
      displayName: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      lastLoginAt: Date | null;
    };
  }>,
) {
  const roleLabels: Record<string, string> = {
    OWNER: 'Владелец',
    ADMIN: 'Администратор',
    MANAGER: 'Менеджер',
    ANALYST: 'Аналитик',
    MEMBER: 'Участник',
  };
  const now = Date.now();
  return rows.map((member, index) => {
    const name = member.user.displayName
      || `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim()
      || member.user.email
      || 'Участник';
    const age = member.user.lastLoginAt ? now - member.user.lastLoginAt.getTime() : Number.POSITIVE_INFINITY;
    const status = age <= 15 * 60_000 ? 'online' : age <= DAY_MS ? 'away' : 'offline';
    return {
      id: member.id,
      name,
      initials: memberInitials(member.user),
      role: roleLabels[member.role] ?? member.role,
      status,
      tone: ['violet', 'purple', 'cyan', 'orange'][index % 4],
    };
  });
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
  const since31 = new Date(now.getTime() - 31 * DAY_MS);
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
    taskRows,
    reportRows,
    teamRows,
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
      ? app.prisma.task.findMany({
          where: { organizationId, createdAt: { gte: since31 } },
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            createdAt: true,
            reviewId: true,
            caseId: true,
            locationId: true,
            businessId: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 2_000,
        })
      : Promise.resolve([]),
    access.reports
      ? app.prisma.report.findMany({
          where: { organizationId, createdAt: { gte: since31 } },
          select: { id: true, title: true, status: true, createdAt: true, generatedAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 100,
        })
      : Promise.resolve([]),
    access.team
      ? app.prisma.organizationMember.findMany({
          where: { organizationId, status: 'ACTIVE' },
          select: {
            id: true,
            role: true,
            user: {
              select: {
                displayName: true,
                firstName: true,
                lastName: true,
                email: true,
                lastLoginAt: true,
              },
            },
          },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          take: 8,
        })
      : Promise.resolve([]),
  ]);

  const timelineRows: TimelineRow[] = timelineRaw.map((row) => ({
    receivedAt: row.receivedAt,
    rating: row.rating,
    answered: row.replies.length > 0,
  }));
  const total = aggregate._count._all;
  const averageRating = roundRating(aggregate._avg.rating);
  const measured = total > 0;
  const positiveShare = percent(positive, total);
  const negativeShare = percent(negative, total);
  const responseCoverage = percent(answered, total);

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

  const sourceIds = access.analytics ? sourceDistribution.map((item) => item.sourceId) : [];
  const sources = sourceIds.length
    ? await app.prisma.reviewSource.findMany({
        where: { organizationId, id: { in: sourceIds } },
        select: { id: true, provider: true, name: true, status: true },
      })
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const pulseSeries = buildDailySeries(rowsWithinDays(timelineRows, 14), organization.timezone, 14);
  const openTasks = access.tasks
    ? taskRows.filter((task) => !['DONE', 'ARCHIVED'].includes(task.status)).length
    : 0;
  const overdueTasks = access.tasks
    ? taskRows.filter((task) => !['DONE', 'ARCHIVED'].includes(task.status) && task.deadline && task.deadline < now).length
    : 0;

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
      billing: false,
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
        active: activeSources > 0,
        caption: activeSources ? `${activeSources} активных источников` : 'Источники не подключены',
      },
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
          week: buildTaskGroups(taskRows, 7),
          month: buildTaskGroups(taskRows, 31),
        }
      : {},
    processes: access.tasks ? buildProcesses(taskRows, organization.locale, organization.timezone) : [],
    reports: access.reports
      ? {
          week: buildReports(reportRows, organization.locale, organization.timezone, 7),
          month: buildReports(reportRows, organization.locale, organization.timezone, 31),
        }
      : {},
    team: access.team ? normalizeTeam(teamRows) : [],
    integrations: access.integrations
      ? sources.map((source) => ({
          id: source.id,
          provider: source.provider,
          name: source.name,
          status: source.status,
        }))
      : [],
  };
}
