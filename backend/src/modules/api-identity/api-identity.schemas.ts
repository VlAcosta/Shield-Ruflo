import { z } from 'zod';

const permissionsSchema = z.array(z.string().trim().min(1).max(120)).min(1).max(32);

export const createServiceAccountSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional(),
  permissions: permissionsSchema,
  expiresAt: z.string().datetime().optional(),
  initialKeyName: z.string().trim().min(2).max(160).default('Primary key'),
  initialKeyExpiresAt: z.string().datetime().optional(),
});

export const createServiceAccountKeySchema = z.object({
  name: z.string().trim().min(2).max(160),
  permissions: permissionsSchema.optional(),
  expiresAt: z.string().datetime().optional(),
});

export const serviceAccountIdParamsSchema = z.object({
  serviceAccountId: z.string().uuid(),
});

export const serviceAccountKeyParamsSchema = serviceAccountIdParamsSchema.extend({
  apiKeyId: z.string().uuid(),
});
