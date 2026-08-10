import { z } from 'zod';
import { permissions } from '../../core/rbac/permissions.js';

export const invitationTokenParamsSchema = z.object({
  token: z.string().trim().min(20).max(512),
});

export const invitationIdParamsSchema = z.object({
  invitationId: z.string().uuid(),
});

export const memberIdParamsSchema = z.object({
  memberId: z.string().uuid(),
});

export const memberSessionParamsSchema = z.object({
  memberId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

const permissionOverridesSchema = z.object({
  allow: z.array(z.enum(permissions)).max(permissions.length).default([]),
  deny: z.array(z.enum(permissions)).max(permissions.length).default([]),
}).default({ allow: [], deny: [] });

export const createInvitationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: z.string().trim().min(1).max(40).default('MEMBER'),
  accessRoleId: z.string().trim().min(1).max(40).optional(),
  accessExpiresAt: z.union([z.string().datetime({ offset: true }), z.literal(''), z.null()]).optional(),
  access_expires_at: z.union([z.string().datetime({ offset: true }), z.literal(''), z.null()]).optional(),
  permissionOverrides: permissionOverridesSchema.optional(),
  permission_overrides: permissionOverridesSchema.optional(),
});

export const updateMemberSchema = z.object({
  role: z.string().trim().min(1).max(40).optional(),
  accessRoleId: z.string().trim().min(1).max(40).optional(),
  accessExpiresAt: z.union([z.string().datetime({ offset: true }), z.literal(''), z.null()]).optional(),
  securityStatus: z.enum(['active', 'frozen']).optional(),
  status: z.enum(['active', 'frozen']).optional(),
  frozenReason: z.string().trim().max(240).optional(),
  permissionOverrides: permissionOverridesSchema.optional(),
  permission_overrides: permissionOverridesSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one member field is required' });

export const updateMemberSecuritySchema = z.object({
  status: z.enum(['active', 'frozen']).optional(),
  accessExpiresAt: z.union([z.string().datetime({ offset: true }), z.literal(''), z.null()]).optional(),
  frozenReason: z.string().trim().max(240).optional(),
  permissionOverrides: permissionOverridesSchema.optional(),
  permission_overrides: permissionOverridesSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one security field is required' });
