import { z } from 'zod';

const legalType = z.enum(['ul', 'ip']);
const integrationDraftItem = z.object({
  enabled: z.boolean().default(false),
  link: z.string().trim().max(2048).default(''),
});

export const onboardingDraftSchema = z.object({
  version: z.literal(2).default(2),
  step: z.number().int().min(0).max(2).default(0),
  organization: z.object({
    type: legalType.default('ul'),
    title: z.string().trim().max(180).default(''),
    inn: z.string().trim().regex(/^\d*$/).max(12).default(''),
    kpp: z.string().trim().regex(/^\d*$/).max(9).default(''),
    ogrn: z.string().trim().regex(/^\d*$/).max(15).default(''),
    address: z.string().trim().max(2000).default(''),
    status: z.string().trim().max(160).default(''),
    registrationDate: z.string().trim().max(32).default(''),
    confirmed: z.boolean().default(false),
    source: z.string().trim().max(120).default(''),
    demo: z.boolean().default(false),
  }),
  integrations: z.record(z.string().max(80), integrationDraftItem).default({}),
  security: z.object({
    autoLock: z.boolean().default(true),
    sessionMinutes: z.number().int().min(1).max(1440).default(15),
  }),
});

export const saveOnboardingStateSchema = z.object({
  step: z.number().int().min(0).max(2),
  draft: onboardingDraftSchema,
});

export const completeOnboardingSchema = z.object({
  organization: z.object({
    type: legalType,
    title: z.string().trim().min(2).max(180),
    inn: z.string().trim().regex(/^\d{10}$|^\d{12}$/),
    kpp: z.string().trim().regex(/^\d{9}$/).or(z.literal('')).optional(),
    ogrn: z.string().trim().regex(/^\d{13}$|^\d{15}$/).or(z.literal('')).optional(),
    address: z.string().trim().max(2000).optional(),
    status: z.string().trim().max(160).optional(),
    registrationDate: z.string().trim().max(32).optional(),
    source: z.string().trim().max(120).optional(),
    demo: z.boolean().default(false),
    confirmed: z.literal(true),
  }),
  business: z.object({
    name: z.string().trim().min(2).max(180).optional(),
    website: z.union([z.string().trim().url().max(2048), z.literal('')]).optional(),
    industry: z.string().trim().max(120).optional(),
  }).optional(),
  locations: z.array(z.object({
    name: z.string().trim().min(2).max(180),
    is_primary: z.boolean().default(false),
    country_code: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
    region: z.string().trim().max(160).optional(),
    city: z.string().trim().max(160).optional(),
    address_line_1: z.string().trim().max(240).optional(),
    address_line_2: z.string().trim().max(240).optional(),
    postal_code: z.string().trim().max(32).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    timezone: z.string().trim().max(80).optional(),
  })).max(100).default([]),
  integrations: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
});
