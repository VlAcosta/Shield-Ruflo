import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { getDashboardOverview } from '../dashboard/dashboard.service.js';
import { getReview, presentReview, reviewInclude } from '../reviews/reviews.service.js';

const externalReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  businessId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  q: z.string().trim().min(1).max(200).optional(),
}).refine((value) => !value.minRating || !value.maxRating || value.minRating <= value.maxRating, {
  message: 'minRating must be <= maxRating',
  path: ['minRating'],
});

const reviewParamsSchema = z.object({ reviewId: z.string().uuid() });

function principalOrganizationId(request: { apiPrincipal: { organizationId: string } | null }): string {
  if (!request.apiPrincipal) {
    throw new AppError({ code: 'API_KEY_REQUIRED', message: 'Требуется API key', statusCode: 401 });
  }
  return request.apiPrincipal.organizationId;
}

export const externalApiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/external/dashboard/overview', {
    preHandler: [app.authenticateApiKey, app.authorizeApiScope('dashboard.view')],
  }, async (request) => {
    const result = await getDashboardOverview(app, principalOrganizationId(request));
    if (!result) throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Организация не найдена', statusCode: 404 });
    return result;
  });

  app.get('/external/reviews', {
    preHandler: [app.authenticateApiKey, app.authorizeApiScope('reviews.view')],
  }, async (request) => {
    const organizationId = principalOrganizationId(request);
    const query = externalReviewsQuerySchema.parse(request.query);
    const where: any = { organizationId };
    if (query.businessId) where.businessId = query.businessId;
    if (query.locationId) where.locationId = query.locationId;
    if (query.minRating || query.maxRating) {
      where.rating = {
        ...(query.minRating ? { gte: query.minRating } : {}),
        ...(query.maxRating ? { lte: query.maxRating } : {}),
      };
    }
    if (query.q) {
      where.OR = [
        { text: { contains: query.q, mode: 'insensitive' } },
        { title: { contains: query.q, mode: 'insensitive' } },
        { author: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    const skip = (query.page - 1) * query.pageSize;
    const [total, items] = await app.prisma.$transaction([
      app.prisma.review.count({ where }),
      app.prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { receivedAt: 'desc' },
        skip,
        take: query.pageSize,
      }),
    ]);
    return {
      items: items.map(presentReview),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get('/external/reviews/:reviewId', {
    preHandler: [app.authenticateApiKey, app.authorizeApiScope('reviews.view')],
  }, async (request) => {
    const { reviewId } = reviewParamsSchema.parse(request.params);
    return { review: await getReview(app, principalOrganizationId(request), reviewId) };
  });
};
