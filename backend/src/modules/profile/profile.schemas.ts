import { z } from 'zod';

export const updatePersonalProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  email: z.union([z.string().trim().email().max(320), z.literal('')]).optional(),
  phone: z.string().trim().max(32).optional(),
  position: z.string().trim().max(160).optional(),
  telegram: z.string().trim().max(120).optional(),
  avatar: z.string().max(2_000_000).optional(),
  notifications: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one profile field is required' });

export const sessionIdParamsSchema = z.object({
  sessionId: z.string().uuid(),
});
