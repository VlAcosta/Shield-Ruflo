import { z } from 'zod';

export const reviewIdParamsSchema = z.object({ reviewId: z.string().uuid() });
export const sourceIdParamsSchema = z.object({ sourceId: z.string().uuid() });
export const assignmentIdParamsSchema = z.object({ assignmentId: z.string().uuid() });

const csv = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return undefined;
}, z.array(z.string()).optional());

const booleanish = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

export const listReviewsQuerySchema = z.object({
  status: csv,
  workflowStatus: csv,
  rating: z.coerce.number().int().min(1).max(5).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  sourceId: z.string().uuid().optional(),
  businessId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  tag: z.string().trim().min(1).max(100).optional(),
  assignedToMe: booleanish,
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(['receivedAt', 'rating', 'updatedAt']).default('receivedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const updateReviewSchema = z.object({
  status: z.enum(['new', 'deferred', 'done', 'archived', 'NEW', 'DEFERRED', 'DONE', 'ARCHIVED']).optional(),
  workflowStatus: z.enum(['inbox', 'draft', 'awaiting_approval', 'approved', 'published', 'rejected', 'INBOX', 'DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED']).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const replySchema = z.object({
  text: z.string().trim().min(1).max(8000),
  publish: z.boolean().default(true),
});

export const assignReviewSchema = z.object({
  memberId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export const createSourceSchema = z.object({
  businessId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  provider: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(180),
  externalAccountId: z.string().trim().max(240).nullable().optional(),
  externalUrl: z.string().url().max(2000).nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DISCONNECTED']).default('ACTIVE'),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateSourceSchema = createSourceSchema.partial().omit({ businessId: true });

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().trim().max(32).nullable().optional(),
});

export const seedReviewSchema = z.object({
  sourceId: z.string().uuid(),
  businessId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  externalId: z.string().trim().min(1).max(240),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(1).max(20000),
  title: z.string().trim().max(300).nullable().optional(),
  author: z.object({
    externalId: z.string().trim().max(240).nullable().optional(),
    name: z.string().trim().min(1).max(180),
    avatarUrl: z.string().url().max(2000).nullable().optional(),
    profileUrl: z.string().url().max(2000).nullable().optional(),
  }).optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
