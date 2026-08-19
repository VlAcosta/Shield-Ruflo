import { z } from 'zod';
import { WEBHOOK_EVENT_TYPES } from './webhook-security.js';

export const webhookEventSchema = z.enum(WEBHOOK_EVENT_TYPES);

export const createWebhookEndpointSchema = z.object({
  name: z.string().trim().min(2).max(160),
  url: z.string().trim().url().max(2048),
  events: z.array(webhookEventSchema).min(1).max(WEBHOOK_EVENT_TYPES.length).transform((items) => [...new Set(items)]),
});

export const updateWebhookEndpointSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  url: z.string().trim().url().max(2048).optional(),
  events: z.array(webhookEventSchema).min(1).max(WEBHOOK_EVENT_TYPES.length).transform((items) => [...new Set(items)]).optional(),
  status: z.enum(['active', 'paused']).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const webhookEndpointParamsSchema = z.object({ endpointId: z.string().uuid() });
export const webhookDeliveryParamsSchema = z.object({ deliveryId: z.string().uuid() });

export const webhookDeliveryQuerySchema = z.object({
  endpointId: z.string().uuid().optional(),
  status: z.enum(['queued', 'retrying', 'delivered', 'dead']).optional(),
  eventType: webhookEventSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
