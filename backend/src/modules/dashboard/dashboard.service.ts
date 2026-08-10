import type { FastifyInstance } from 'fastify';

const DAY_MS = 86_400_000;

function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
    app.prisma.task.count({ where: { organizationId, status: { in: ['NEW', 'IN_PROGRESS', 'WAITING'] } } }),
    app.prisma.task.count({
      where: {
        organizationId,
        status: { in: ['NEW', 'IN_PROGRESS', 'WAITING'] },
        deadline: { lt: now },
      },
    }),
  ]);

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

  const sourceIds = sourceDistribution.map((item) => item.sourceId);
  const sources = sourceIds.length
    ? await app.prisma.reviewSource.findMany({
        where: { organizationId, id: { in: sourceIds } },
        select: { id: true, provider: true, name: true, status: true },
      })
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const timeline = buildDailySeries(timelineRows, organization.timezone, 28);

  return {
    generatedAt: new Date().toISOString(),
    timezone: organization.timezone,
    measured,
    dataAvailability: {
      reviews: measured,
      tasks: true,
      integrations: true,
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
      tasks: {
        value: openTasks,
        caption: overdueTasks ? `${overdueTasks} просрочено` : 'Без просроченных задач',
      },
      shield: {
        active: activeSources > 0,
        caption: activeSources ? `${activeSources} активных источников` : 'Источники не подключены',
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
        positive: positiveShare,
        answered: responseCoverage,
      },
    },
    tasks: { open: openTasks, overdue: overdueTasks },
    integrations: sources.map((source) => ({
      id: source.id,
      provider: source.provider,
      name: source.name,
      status: source.status,
    })),
  };
}
