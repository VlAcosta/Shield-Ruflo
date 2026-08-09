import { z } from 'zod';

const e164Phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must use E.164 format, for example +79991234567');

export const authModeSchema = z.enum(['login', 'register']).default('login');

export const requestCodeSchema = z.object({
  phone: e164Phone,
  mode: authModeSchema,
  tariff: z.string().trim().max(80).nullable().optional(),
  invitation_token: z.string().trim().max(512).nullable().optional(),
});

export const verifyCodeSchema = z.object({
  phone: e164Phone,
  code: z.string().trim().regex(/^\d{4}$/, 'Verification code must contain 4 digits'),
  session_id: z.string().uuid(),
  mode: authModeSchema,
  invitation_token: z.string().trim().max(512).nullable().optional(),
});

export const completeProfileSchema = z.object({
  phone: e164Phone,
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email().max(320), z.literal('')]).optional(),
  tariff: z.string().trim().max(80).nullable().optional(),
  invitation_token: z.string().trim().max(512).nullable().optional(),
});
