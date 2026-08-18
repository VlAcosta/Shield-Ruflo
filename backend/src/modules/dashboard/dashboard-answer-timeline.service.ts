import type { FastifyInstance } from 'fastify';

const DAY_MS = 86_400_000;
const TIMELINE_DAYS = 28;

type DashboardOverview = NonNullable<Awaited<ReturnType<typeof import('./dashboard.service.js').getDashboardOverview>>>;

function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function growth(values: number[]): number {
  if (values.length < 2) return 0;
  const pivot = Math.max(1, Math.floor(values.length / 2));
  const previous = sum(values.slice(0, pivot));
  const current = sum(values.slice(pivot));
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function enrichDashboardWithAnswerTimeline(
  app: FastifyInstance,
  organizationId: string,
  overview: DashboardOverview,
): Promise<DashboardOverview & {
  reviews: DashboardOverview['reviews'] & {
    week: {
      labels: string[];
      received: number[];
      answered: number[];
      total: number;
      growth: number;
    };
    month: DashboardOverview['reviews']['month'] & {
      answered: number[];
      total: number;
      growth: number;
    };
  };
}> {
  const monthLabels = Array.isArray(overview.reviews?.month?.labels)
    ? overview.reviews.month.labels.map(String)
    : [];
  const monthReceived = Array.isArray(overview.reviews?.month?.received)
    ? overview.reviews.month.received.map(Number)
    : [];

  if (!monthLabels.length) {
    const emptyWeek = { labels: [], received: [], answered: [], total: 0, growth: 0 };
    return {
      ...overview,
      reviews: {
        ...overview.reviews,
        week: emptyWeek,
        month: {
          ...overview.reviews.month,
          answered: [],
          total: sum(monthReceived),
          growth: growth(monthReceived),
        },
      },
    };
  }

  // Query a little wider than 28*24h so timezone offsets/DST cannot drop the
  // first visible dashboard day. Review.repliedAt is set atomically when the
  // provider confirms publication, so one review contributes at most once.
  const since = new Date(Date.now() - (TIMELINE_DAYS + 2) * DAY_MS);
  const repliedRows = await app.prisma.review.findMany({
    where: {
      organizationId,
      workflowStatus: 'PUBLISHED',
      repliedAt: { gte: since },
    },
    select: { repliedAt: true },
    orderBy: { repliedAt: 'asc' },
    take: 50_000,
  });

  const answeredByDay = new Map<string, number>();
  for (const row of repliedRows) {
    if (!row.repliedAt) continue;
    const key = dateKey(row.repliedAt, overview.timezone);
    answeredByDay.set(key, (answeredByDay.get(key) ?? 0) + 1);
  }

  const monthAnswered = monthLabels.map((label) => answeredByDay.get(label) ?? 0);
  const weekLabels = monthLabels.slice(-7);
  const weekReceived = monthReceived.slice(-7);
  const weekAnswered = monthAnswered.slice(-7);

  return {
    ...overview,
    reviews: {
      ...overview.reviews,
      week: {
        labels: weekLabels,
        received: weekReceived,
        answered: weekAnswered,
        total: sum(weekReceived),
        growth: growth(weekReceived),
      },
      month: {
        ...overview.reviews.month,
        answered: monthAnswered,
        total: sum(monthReceived),
        growth: growth(monthReceived),
      },
    },
  };
}
