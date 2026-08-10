import { z } from 'zod';

const optionalDigits = (max: number) => z.union([z.string().trim().regex(/^\d*$/).max(max), z.literal('')]).optional();
const optionalUrl = z.union([z.string().trim().url().max(2048), z.literal('')]).optional();

export const companyLookupSchema = z.object({
  inn: z.string().trim().regex(/^\d{10}$|^\d{12}$/),
});

export const companyLookupResultSchema = z.object({
  type: z.enum(['ul', 'ip']),
  title: z.string().trim().min(2).max(180),
  shortTitle: z.string().trim().min(1).max(180).optional(),
  inn: z.string().trim().regex(/^\d{10}$|^\d{12}$/),
  kpp: z.string().trim().regex(/^\d{9}$/).optional(),
  ogrn: z.string().trim().regex(/^\d{13}$|^\d{15}$/).optional(),
  address: z.string().trim().max(2000).optional(),
  status: z.string().trim().max(160).optional(),
  registrationDate: z.string().trim().max(32).optional(),
}).strict();

export const companyLookupWebhookResponseSchema = z.union([
  companyLookupResultSchema,
  z.object({
    company: companyLookupResultSchema,
    source: z.string().trim().min(1).max(120).optional(),
  }).strict(),
]);

export const updateCompanyProfileSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  inn: optionalDigits(12),
  kpp: optionalDigits(9),
  ogrn: optionalDigits(15),
  legalAddress: z.string().trim().max(2000).optional(),
  registrationDate: z.union([
    z.string().trim().regex(/^\d{2}\.\d{2}\.\d{4}$/),
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.literal(''),
  ]).optional(),
  registryStatus: z.string().trim().max(160).optional(),
  website: optionalUrl,
  industry: z.string().trim().max(120).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');
