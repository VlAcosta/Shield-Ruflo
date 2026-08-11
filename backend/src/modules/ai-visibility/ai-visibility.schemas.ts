import { z } from 'zod';

export const AI_VISIBILITY_PROMPT_VERSION = 'p23-visibility-v1';

export const visibilitySentimentSchema = z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN']);

export const visibilityProviderOutputSchema = z.object({
  brandMentioned: z.boolean(),
  brandPosition: z.number().int().positive().nullable(),
  sentiment: visibilitySentimentSchema,
  competitors: z.array(z.object({
    name: z.string().trim().min(1).max(240),
    position: z.number().int().positive().nullable(),
  })).max(25),
  recommendations: z.array(z.string().trim().min(1).max(500)).max(12),
  answerSummary: z.string().trim().min(1).max(12_000),
});

export type VisibilityProviderOutput = z.infer<typeof visibilityProviderOutputSchema>;

export const createVisibilityProbeSchema = z.object({
  name: z.string().trim().min(1).max(180),
  query: z.string().trim().min(3).max(2000),
  locationId: z.string().uuid().nullable().optional(),
  languageCode: z.string().trim().min(2).max(16).default('ru'),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).nullable().optional(),
});

export const updateVisibilityProbeSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  query: z.string().trim().min(3).max(2000).optional(),
  locationId: z.string().uuid().nullable().optional(),
  languageCode: z.string().trim().min(2).max(16).optional(),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).nullable().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const visibilityProbeIdParamsSchema = z.object({ probeId: z.string().uuid() });
export const visibilityRunIdParamsSchema = z.object({ runId: z.string().uuid() });

export const visibilityListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const visibilityMetricsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  locationId: z.string().uuid().optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, { message: 'from must be before to' });
