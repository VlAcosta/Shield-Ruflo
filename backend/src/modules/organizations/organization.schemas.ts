import { z } from 'zod';

export const organizationIdParamsSchema = z.object({ organizationId: z.string().uuid() });
export const businessIdParamsSchema = z.object({ businessId: z.string().uuid() });
export const locationIdParamsSchema = z.object({ locationId: z.string().uuid() });

const optionalUrl = z.union([z.string().trim().url().max(2048), z.literal('')]).optional();

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(180),
  legal_name: z.string().trim().max(240).optional(),
  business_name: z.string().trim().min(2).max(180).optional(),
  industry: z.string().trim().max(120).optional(),
  website: optionalUrl,
  timezone: z.string().trim().min(1).max(80).default('Europe/Moscow'),
  locale: z.string().trim().min(2).max(16).default('ru-RU'),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  legal_name: z.string().trim().max(240).optional(),
  industry: z.string().trim().max(120).optional(),
  website: optionalUrl,
  timezone: z.string().trim().min(1).max(80).optional(),
  locale: z.string().trim().min(2).max(16).optional(),
  legal_type: z.enum(['ul', 'ip']).nullable().optional(),
  inn: z.union([z.string().trim().regex(/^\d{10}$|^\d{12}$/), z.literal('')]).optional(),
  kpp: z.union([z.string().trim().regex(/^\d{9}$/), z.literal('')]).optional(),
  ogrn: z.union([z.string().trim().regex(/^\d{13}$|^\d{15}$/), z.literal('')]).optional(),
  legal_address: z.string().trim().max(2000).optional(),
  legal_status: z.string().trim().max(160).optional(),
  registration_date: z.union([
    z.string().trim().regex(/^\d{2}\.\d{2}\.\d{4}$/),
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.literal(''),
  ]).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(180),
  legal_name: z.string().trim().max(240).optional(),
  industry: z.string().trim().max(120).optional(),
  website: optionalUrl,
  is_primary: z.boolean().default(false),
});

export const updateBusinessSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  legal_name: z.string().trim().max(240).optional(),
  industry: z.string().trim().max(120).optional(),
  website: optionalUrl,
  is_primary: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const createLocationSchema = z.object({
  name: z.string().trim().min(2).max(180),
  is_primary: z.boolean().default(false),
  country_code: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  region: z.string().trim().max(160).optional(),
  city: z.string().trim().max(160).optional(),
  address_line_1: z.string().trim().max(240).optional(),
  address_line_2: z.string().trim().max(240).optional(),
  postal_code: z.string().trim().max(32).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().trim().max(80).optional(),
});

export const updateLocationSchema = createLocationSchema
  .omit({ is_primary: true })
  .partial()
  .extend({ is_primary: z.boolean().optional() })
  .refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
);
