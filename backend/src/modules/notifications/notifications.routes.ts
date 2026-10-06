import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import {
  getNotificationConfig,
  mergeNotificationPreferences,
  mergeNotificationSettings,
  saveNotificationConfig,
} from './notifications.service.js';

const notificationIdParams = z.object({
  notificationId: z.string().uuid(),
});

const notificationPreferencesPatchSchema = z.object({
  activeTab: z.enum(['unread', 'all', 'settings']).optional(),
  activeType: z.enum(['all', 'reviews', 'tasks', 'reports', 'chat', 'system']).optional(),
}).strict();

const channelPatchSchema = z.object({
  email: z.boolean().optional(),
  telegram: z.boolean().optional(),
  push: z.boolean().optional(),
  sms: z.boolean().optional(),
}).strict();

const eventPatchSchema = z.object({
  review: z.boolean().optional(),
  overdueTask: z.boolean().optional(),
  completedTask: z.boolean().optional(),
  reportReady: z.boolean().optional(),
  message: z.boolean().optional(),
  subscription: z.boolean().optional(),
}).strict();

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const quietHoursPatchSchema = z.object({
  enabled: z.boolean().optional(),
  from: timeSchema.optional(),
  to: timeSchema.optional(),
}).strict();

const notificationSettingsPatchSchema = z.object({
  channels: channelPatchSchema.optional(),
  events: eventPatchSchema.optional(),
  quietHours: quietHoursPatchSchema.optional(),
}).strict();

function authContext(request: FastifyRequest) {
  const organizationId = request.auth?.organizationId;
  const userId = request.auth?.userId;
  if (!organizationId || !userId) {
    throw new AppError({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'Рабочее пространство не выбрано',
      statusCode: 409,
    });
  }
  return { organizationId, userId };
}

function assertConfiguredChannels(patch: z.infer<typeof channelPatchSchema> | undefined) {
  if (!patch) return;
  const requested = Object.entries(patch)
    .filter(([, enabled]) => enabled === true)
    .map(([channel]) => channel);
  if (!requested.length) return;

  throw new AppError({
    code: 'NOTIFICATION_CHANNEL_NOT_CONFIGURED',
    message: 'Внешние каналы уведомлений пока не подключены',
    statusCode: 409,
    details: { channels: requested },
  });
}

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/notifications', { preHandler: [app.authenticate] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const [notifications, config] = await Promise.all([
      app.prisma.notification.findMany({
        where: { organizationId, userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      getNotificationConfig(app.prisma, userId),
    ]);

    return {
      version: 1,
      source: 'api',
      notifications,
      preferences: config.preferences,
      settings: config.settings,
    };
  });

  app.patch('/notifications/:notificationId/read', { preHandler: [app.authenticate] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const { notificationId } = notificationIdParams.parse(request.params);
    const notification = await app.prisma.notification.findFirst({
      where: { id: notificationId, organizationId, userId },
      select: { id: true, status: true, readAt: true },
    });
    if (!notification) {
      throw new AppError({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Уведомление не найдено',
        statusCode: 404,
      });
    }

    if (notification.status === 'READ') {
      return {
        notification: await app.prisma.notification.findUniqueOrThrow({
          where: { id: notification.id },
        }),
      };
    }

    return {
      notification: await app.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'READ', readAt: new Date() },
      }),
    };
  });

  app.patch('/notifications/read-all', { preHandler: [app.authenticate] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const result = await app.prisma.notification.updateMany({
      where: { organizationId, userId, status: 'UNREAD' },
      data: { status: 'READ', readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  });

  app.patch('/notifications/preferences', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = authContext(request);
    const patch = notificationPreferencesPatchSchema.parse(request.body);
    const current = await getNotificationConfig(app.prisma, userId);
    const preferences = mergeNotificationPreferences(current.preferences, patch);
    await saveNotificationConfig(app.prisma, userId, { ...current, preferences });
    return { preferences };
  });

  app.patch('/notifications/settings', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = authContext(request);
    const patch = notificationSettingsPatchSchema.parse(request.body);
    assertConfiguredChannels(patch.channels);

    const current = await getNotificationConfig(app.prisma, userId);
    const settings = mergeNotificationSettings(current.settings, patch);
    await saveNotificationConfig(app.prisma, userId, { ...current, settings });
    return { settings };
  });
};
