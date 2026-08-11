import { z } from 'zod';

export const createAgencyInvitationSchema = z.object({ clientOrganizationId: z.string().uuid() });
export const agencyInvitationTokenParamsSchema = z.object({ token: z.string().min(32).max(256) });
export const agencyLinkIdParamsSchema = z.object({ linkId: z.string().uuid() });
export const updateAgencyLinkSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'REVOKED']) });
