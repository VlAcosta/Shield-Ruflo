import { z } from 'zod';

const httpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'https:' || protocol === 'http:';
}, 'Допустимы только http/https ссылки');

export const campaignIdParamsSchema = z.object({ campaignId: z.string().uuid() });
export const publicCampaignParamsSchema = z.object({ slug: z.string().trim().min(8).max(96).regex(/^[A-Za-z0-9_-]+$/) });
export const targetClickParamsSchema = publicCampaignParamsSchema.extend({ targetId: z.string().uuid() });

export const campaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']);
export const acquisitionChannelSchema = z.enum(['QR', 'LINK', 'EMAIL', 'SMS', 'WHATSAPP', 'OTHER']);

export const reviewTargetSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  url: httpUrlSchema,
  priority: z.number().int().min(0).max(10_000).default(100),
  enabled: z.boolean().default(true),
}).strict();

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(180),
  businessId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  channel: acquisitionChannelSchema.default('QR'),
  headline: z.string().trim().min(1).max(240).default('Расскажите о вашем опыте'),
  description: z.string().trim().max(4000).default(''),
  thankYouMessage: z.string().trim().min(1).max(500).default('Спасибо за обратную связь!'),
  collectContact: z.boolean().default(false),
  caseBelowRating: z.number().int().min(1).max(5).nullable().default(2),
  targets: z.array(reviewTargetSchema).max(20).default([]),
}).strict();

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: campaignStatusSchema.optional(),
}).strict();

export const campaignListQuerySchema = z.object({
  status: campaignStatusSchema.optional(),
  locationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
}).strict();

export const publicCampaignQuerySchema = z.object({
  invite: z.string().trim().min(20).max(256).optional(),
  session: z.string().trim().min(8).max(128).optional(),
}).strict();

export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(5000).default(''),
  contactName: z.string().trim().max(180).optional(),
  contactEmail: z.string().trim().email().max(320).optional(),
  contactPhone: z.string().trim().max(64).optional(),
  consentToContact: z.boolean().default(false),
  invite: z.string().trim().min(20).max(256).optional(),
  session: z.string().trim().min(8).max(128).optional(),
}).strict();

export const createInviteSchema = z.object({
  channel: acquisitionChannelSchema.default('LINK'),
  expiresInDays: z.number().int().min(1).max(90).default(30),
  externalReference: z.string().trim().max(240).optional(),
}).strict();

export const feedbackListQuerySchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(['NEW', 'ACKNOWLEDGED', 'CASE_OPENED', 'ARCHIVED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
}).strict();

export const acquisitionMetricsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict();

export type CreateAcquisitionCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateAcquisitionCampaignInput = z.infer<typeof updateCampaignSchema>;
