import { z } from 'zod';

const optionalHttpUrl = z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)).nullable().optional();

export const competitorIdParamsSchema = z.object({ competitorId: z.string().uuid() });
export const competitorLocationParamsSchema = competitorIdParamsSchema.extend({ locationId: z.string().uuid() });

export const createCompetitorSchema = z.object({
  name: z.string().trim().min(1).max(180),
  website: optionalHttpUrl,
  notes: z.string().trim().max(20_000).default(''),
  locations: z.array(z.object({
    name: z.string().trim().min(1).max(180),
    addressLabel: z.string().trim().max(500).optional(),
    city: z.string().trim().max(180).optional(),
    region: z.string().trim().max(180).optional(),
    countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
    website: optionalHttpUrl,
    googlePlaceId: z.string().trim().min(8).max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
  }).strict()).min(1).max(100),
}).strict();

export const updateCompetitorSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  website: optionalHttpUrl,
  notes: z.string().trim().max(20_000).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
}).strict();

export const addSnapshotSchema = z.object({
  observedAt: z.string().datetime().optional(),
  averageRating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).nullable().optional(),
  reviewVelocity30d: z.number().min(0).nullable().optional(),
  positiveShare: z.number().min(0).max(1).nullable().optional(),
  negativeShare: z.number().min(0).max(1).nullable().optional(),
  responseRate: z.number().min(0).max(1).nullable().optional(),
  reputationScore: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(2000).default(''),
  dedupeKey: z.string().trim().min(1).max(240).optional(),
}).strict().refine((value) => [
  value.averageRating,
  value.reviewCount,
  value.reviewVelocity30d,
  value.positiveShare,
  value.negativeShare,
  value.responseRate,
  value.reputationScore,
].some((metric) => metric !== undefined && metric !== null), { message: 'Нужно передать хотя бы одну метрику' });

export const competitorListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
}).strict();

export const snapshotListQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export const googleLiveSearchSchema = z.object({
  query: z.string().trim().min(3).max(240),
  languageCode: z.string().trim().min(2).max(16).default('ru'),
}).strict();

export const googleLiveLocationQuerySchema = z.object({
  languageCode: z.string().trim().min(2).max(16).default('ru'),
}).strict();

export const benchmarkQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict();

export type CreateCompetitorInput = z.infer<typeof createCompetitorSchema>;
export type AddCompetitiveSnapshotInput = z.infer<typeof addSnapshotSchema>;
