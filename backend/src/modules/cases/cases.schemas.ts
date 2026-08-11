import { z } from 'zod';

export const caseIdParamsSchema = z.object({ caseId: z.string().uuid() });
export const reviewCaseParamsSchema = z.object({ reviewId: z.string().uuid() });

export const caseSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const caseOriginSchema = z.enum(['REVIEW', 'AI_TREND', 'MANUAL', 'SURVEY', 'AUTOMATION']);
export const caseStatusSchema = z.enum([
  'NEW',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_INTERNAL',
  'RESOLVED',
  'VERIFIED',
  'CLOSED',
]);

export const createCaseSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  severity: caseSeveritySchema.optional(),
  origin: caseOriginSchema.default('MANUAL'),
  ownerMemberId: z.string().uuid().nullable().optional(),
  slaMinutes: z.number().int().min(0).max(60 * 24 * 90).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  rootCause: z.string().trim().max(20_000).nullable().optional(),
  resolution: z.string().trim().max(20_000).nullable().optional(),
  reviewIds: z.array(z.string().uuid()).max(100).default([]),
  locationIds: z.array(z.string().uuid()).max(100).default([]),
  sourceDedupeKey: z.string().trim().min(1).max(240).optional(),
}).strict();

export const updateCaseSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  severity: caseSeveritySchema.optional(),
  ownerMemberId: z.string().uuid().nullable().optional(),
  slaMinutes: z.number().int().min(0).max(60 * 24 * 90).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  rootCause: z.string().trim().max(20_000).nullable().optional(),
  resolution: z.string().trim().max(20_000).nullable().optional(),
}).strict();

export const transitionCaseSchema = z.object({
  status: z.enum(['TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED']),
  note: z.string().trim().max(4000).optional(),
  resolution: z.string().trim().min(1).max(20_000).optional(),
}).strict();

export const verifyCaseSchema = z.object({
  note: z.string().trim().max(4000).optional(),
}).strict();

export const reopenCaseSchema = z.object({
  note: z.string().trim().min(1).max(4000),
}).strict();

export const caseTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20_000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  deadline: z.string().datetime().nullable().optional(),
  assigneeMemberIds: z.array(z.string().uuid()).max(50).optional(),
}).strict();

export const caseListQuerySchema = z.object({
  status: caseStatusSchema.optional(),
  severity: caseSeveritySchema.optional(),
  ownerMemberId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  category: z.string().trim().min(1).max(120).optional(),
  overdue: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
}).strict();

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type CaseStatusInput = z.infer<typeof caseStatusSchema>;
