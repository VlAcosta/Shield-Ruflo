import { z } from 'zod';

export const LISTING_HEALTH_SCORE_VERSION = 1;

export const locationIdParamsSchema = z.object({ locationId: z.string().uuid() });
export const listingSourceIdParamsSchema = z.object({ sourceId: z.string().uuid() });

export const updateCanonicalListingSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  website: z.string().url().nullable().optional(),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).nullable().optional(),
  region: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().max(160).nullable().optional(),
  addressLine1: z.string().trim().max(240).nullable().optional(),
  addressLine2: z.string().trim().max(240).nullable().optional(),
  postalCode: z.string().trim().max(32).nullable().optional(),
  regularHours: z.record(z.string(), z.unknown()).nullable().optional(),
  categories: z.array(z.string().trim().min(1).max(160)).max(50).nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
  images: z.array(z.string().url()).max(100).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one canonical field is required' });

export const createListingSourceSchema = z.object({
  integrationAccountId: z.string().uuid(),
  externalLocationId: z.string().trim().min(1).max(240),
});

export const listingOverviewQuerySchema = z.object({
  businessId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'DEGRADED', 'ERROR', 'DISABLED']).optional(),
});
