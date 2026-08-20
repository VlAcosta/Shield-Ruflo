import type { FastifyInstance } from 'fastify';

const DAY_MS = 86_400_000;
const TIMELINE_DAYS = 28;
const WEEK_DAYS = 7;

type DashboardOverview = NonNullable<Awaited<ReturnType<typeof import('./dashboard.service.js').getDashboardOverview>>>;

type ReviewPeriod = {
  dates: string[];
  labels: string[];
  received: number[];
  answered: number[];
  total: number;
  answeredTotal: number;
  growth: number;
};

type RatingPeriod = {
  dates: string[];
  labels: string[];
  values: number[];
  current: number;
  growth: number;
  reviews: number;
  totalReviews: number;
  positive: number;
  answered: number;
};

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
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function ratingGrowth(values: number[]): number {
  const measured = values.filter((value) => Number.isFinite(value) && value > 0);
  if (measured.length < 2) return 0;
  const first = measured[0]!;
  const last = measured[measured.length - 1]!;
  return Number((((last - first) / Math.max(0.01, first)) * 100).toFixed(1));
}

function percentage(part: number, total: number): number {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function normalizedDates(candidate: unknown, labels: string[]): string[] {
  if (!Array.isArray(candidate)) return [...labels];
  const dates = candidate.map(String);
  return dates.length === labels.length ? dates : [...labels];
}

export async function enrichDashboardWithAnswerTimeline(
  app: FastifyInstance,
  organizationId: string,
  overview: DashboardOverview,
): Promise<DashboardOverview & {
  reviews: DashboardOverview['reviews'] & {
    week: ReviewPeriod;
    month: DashboardOverview['reviews']['month'] & ReviewPeriod;
  };
  rating: DashboardOverview['rating'] & {
    week: RatingPeriod;
    month: DashboardOverview['rating']['month'] & RatingPeriod;
  };
}> {
  const monthLabels = Array.isArray(overview.reviews?.month?.labels)
    ? overview.reviews.month.labels.map(String)
    : [];
  const monthDates = normalizedDates(overview.reviews?.month?.dates, monthLabels);
  const monthReceived = Array.isArray(overview.reviews?.month?.received)
    ? overview.reviews.month.received.map(Number)
    : [];
  const monthRatingLabels = Array.isArray(overview.rating?.month?.labels)
    ? overview.rating.month.labels.map(String)
    : [];
  const monthRatingDates = normalizedDates(overview.rating?.month?.dates, monthRatingLabels);
  const monthRatingValues = Array.isArray(overview.rating?.month?.values)
    ? overview.rating.month.values.map(Number)
    : [];
  const totalReviews = Number(
    overview.rating?.month?.totalReviews
      ?? overview.reputation?.totalReviews
      ?? 0,
  );

  if (!monthDates.length) {
    const emptyReviewPeriod: ReviewPeriod = {
      dates: [],
      labels: [],
      received: [],
      answered: [],
      total: 0,
      answeredTotal: 0,
      growth: 0,
    };
    const emptyRatingPeriod: RatingPeriod = {
      dates: [],
      labels: [],
      values: [],
      current: Number(overview.rating?.month?.current ?? 0),
      growth: 0,
      reviews: 0,
      totalReviews,
      positive: 0,
      answered: 0,
    };

    return {
      ...overview,
      reviews: {
        ...overview.reviews,
        week: emptyReviewPeriod,
        month: {
          ...overview.reviews.month,
          ...emptyReviewPeriod,
        },
      },
      rating: {
        ...overview.rating,
        week: emptyRatingPeriod,
        month: {
          ...overview.rating.month,
          ...emptyRatingPeriod,
        },
      },
    };
  }

  // Query a little wider than 28*24h so timezone offsets/DST cannot drop the
  // first visible dashboard day. Published ReviewReply rows are the canonical
  // provider-confirmed answer source, matching the global response metric.
  const since = new Date(Date.now() - (TIMELINE_DAYS + 2) * DAY_MS);
  const activityRows = await app.prisma.review.findMany({
    where: {
      organizationId,
      OR: [
        { receivedAt: { gte: since } },
        { replies: { some: { status: 'PUBLISHED', publishedAt: { gte: since } } } },
      ],
    },
    select: {
      receivedAt: true,
      rating: true,
      replies: {
        where: { status: 'PUBLISHED', publishedAt: { gte: since } },
        select: { publishedAt: true },
        orderBy: { publishedAt: 'asc' },
      },
    },
    orderBy: { receivedAt: 'asc' },
    take: 50_000,
  });

  const answeredByDay = new Map<string, number>();
  for (const row of activityRows) {
    // A review can have reply versions/history, but only one review should
    // contribute to coverage for a given published-answer day.
    const publishedAt = row.replies.find((reply) => reply.publishedAt)?.publishedAt;
    if (!publishedAt) continue;
    const key = dateKey(publishedAt, overview.timezone);
    answeredByDay.set(key, (answeredByDay.get(key) ?? 0) + 1);
  }

  const monthAnswered = monthDates.map((key) => answeredByDay.get(key) ?? 0);
  const weekDates = monthDates.slice(-WEEK_DAYS);
  const weekLabels = monthLabels.slice(-WEEK_DAYS);
  const weekReceived = monthReceived.slice(-WEEK_DAYS);
  const weekAnswered = monthAnswered.slice(-WEEK_DAYS);

  const visibleMonthKeys = new Set(monthDates);
  const visibleWeekKeys = new Set(weekDates);
  const monthReviewRows = activityRows.filter((row) => visibleMonthKeys.has(dateKey(row.receivedAt, overview.timezone)));
  const weekReviewRows = monthReviewRows.filter((row) => visibleWeekKeys.has(dateKey(row.receivedAt, overview.timezone)));

  const periodRating = (
    rows: typeof monthReviewRows,
    dates: string[],
    labels: string[],
    values: number[],
  ): RatingPeriod => {
    const positive = rows.filter((row) => row.rating >= 4).length;
    const answered = rows.filter((row) => row.replies.some((reply) => Boolean(reply.publishedAt))).length;
    return {
      dates,
      labels,
      values,
      current: Number(overview.rating?.month?.current ?? 0),
      growth: ratingGrowth(values),
      reviews: rows.length,
      totalReviews,
      positive: percentage(positive, rows.length),
      answered: percentage(answered, rows.length),
    };
  };

  const weekRatingDates = monthRatingDates.slice(-WEEK_DAYS);
  const weekRatingLabels = monthRatingLabels.slice(-WEEK_DAYS);
  const weekRatingValues = monthRatingValues.slice(-WEEK_DAYS);
  const weekRating = periodRating(weekReviewRows, weekRatingDates, weekRatingLabels, weekRatingValues);
  const monthRating = periodRating(monthReviewRows, monthRatingDates, monthRatingLabels, monthRatingValues);

  const monthReviewPeriod: ReviewPeriod = {
    dates: monthDates,
    labels: monthLabels,
    received: monthReceived,
    answered: monthAnswered,
    total: sum(monthReceived),
    answeredTotal: sum(monthAnswered),
    growth: growth(monthReceived),
  };
  const weekReviewPeriod: ReviewPeriod = {
    dates: weekDates,
    labels: weekLabels,
    received: weekReceived,
    answered: weekAnswered,
    total: sum(weekReceived),
    answeredTotal: sum(weekAnswered),
    growth: growth(weekReceived),
  };

  return {
    ...overview,
    reviews: {
      ...overview.reviews,
      week: weekReviewPeriod,
      month: {
        ...overview.reviews.month,
        ...monthReviewPeriod,
      },
    },
    rating: {
      ...overview.rating,
      week: weekRating,
      month: {
        ...overview.rating.month,
        ...monthRating,
      },
    },
  };
}
