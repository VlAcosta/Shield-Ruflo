import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

export type NotificationEventKey =
  | 'review'
  | 'overdueTask'
  | 'completedTask'
  | 'reportReady'
  | 'message'
  | 'subscription';

export type NotificationType = 'reviews' | 'tasks' | 'reports' | 'chat' | 'system' | 'automation';

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  activeTab: 'unread' as const,
  activeType: 'all' as const,
});

export const NOTIFICATION_CHANNEL_CAPABILITIES = Object.freeze({
  email: false,
  telegram: false,
  push: false,
  sms: false,
});

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  channels: {
    ...NOTIFICATION_CHANNEL_CAPABILITIES,
  },
  events: {
    review: true,
    overdueTask: true,
    completedTask: true,
    reportReady: true,
    message: true,
    subscription: true,
  },
  quietHours: {
    enabled: false,
    from: '22:00',
    to: '09:00',
  },
});

export type NotificationPreferences = {
  activeTab: 'unread' | 'all' | 'settings';
  activeType: 'all' | 'reviews' | 'tasks' | 'reports' | 'chat' | 'system';
};

export type NotificationSettings = {
  channels: {
    email: boolean;
    telegram: boolean;
    push: boolean;
    sms: boolean;
  };
  events: Record<NotificationEventKey, boolean>;
  quietHours: {
    enabled: boolean;
    from: string;
    to: string;
  };
};

type NotificationConfig = {
  preferences: NotificationPreferences;
  settings: NotificationSettings;
};

type CreateNotificationInput = {
  organizationId: string;
  userId: string;
  eventKey?: NotificationEventKey;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function booleanRecord(source: unknown, defaults: Record<string, boolean>) {
  const record = asRecord(source);
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, typeof record[key] === 'boolean' ? record[key] : fallback]),
  );
}

export function normalizeNotificationConfig(value: unknown): NotificationConfig {
  const root = asRecord(value);
  const storedPreferences = asRecord(root.preferences);
  const storedSettings = asRecord(root.settings);
  const storedQuietHours = asRecord(storedSettings.quietHours);

  const activeTab = ['unread', 'all', 'settings'].includes(String(storedPreferences.activeTab))
    ? storedPreferences.activeTab as NotificationPreferences['activeTab']
    : DEFAULT_NOTIFICATION_PREFERENCES.activeTab;
  const activeType = ['all', 'reviews', 'tasks', 'reports', 'chat', 'system'].includes(String(storedPreferences.activeType))
    ? storedPreferences.activeType as NotificationPreferences['activeType']
    : DEFAULT_NOTIFICATION_PREFERENCES.activeType;

  return {
    preferences: { activeTab, activeType },
    settings: {
      channels: Object.fromEntries(
        Object.entries(booleanRecord(storedSettings.channels, DEFAULT_NOTIFICATION_SETTINGS.channels))
          .map(([key, enabled]) => [key, Boolean(enabled) && Boolean(NOTIFICATION_CHANNEL_CAPABILITIES[key as keyof typeof NOTIFICATION_CHANNEL_CAPABILITIES])]),
      ) as NotificationSettings['channels'],
      events: booleanRecord(storedSettings.events, DEFAULT_NOTIFICATION_SETTINGS.events) as NotificationSettings['events'],
      quietHours: {
        enabled: typeof storedQuietHours.enabled === 'boolean'
          ? storedQuietHours.enabled
          : DEFAULT_NOTIFICATION_SETTINGS.quietHours.enabled,
        from: typeof storedQuietHours.from === 'string'
          ? storedQuietHours.from
          : DEFAULT_NOTIFICATION_SETTINGS.quietHours.from,
        to: typeof storedQuietHours.to === 'string'
          ? storedQuietHours.to
          : DEFAULT_NOTIFICATION_SETTINGS.quietHours.to,
      },
    },
  };
}

export function mergeNotificationPreferences(
  current: NotificationPreferences,
  patch: Partial<NotificationPreferences>,
): NotificationPreferences {
  return { ...current, ...patch };
}

export function mergeNotificationSettings(
  current: NotificationSettings,
  patch: {
    channels?: Partial<NotificationSettings['channels']>;
    events?: Partial<NotificationSettings['events']>;
    quietHours?: Partial<NotificationSettings['quietHours']>;
  },
): NotificationSettings {
  return {
    channels: { ...current.channels, ...(patch.channels || {}) },
    events: { ...current.events, ...(patch.events || {}) },
    quietHours: { ...current.quietHours, ...(patch.quietHours || {}) },
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function getNotificationConfig(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });
  return normalizeNotificationConfig(user?.notificationPreferences);
}

export async function saveNotificationConfig(
  prisma: PrismaClient,
  userId: string,
  config: NotificationConfig,
) {
  await prisma.user.update({
    where: { id: userId },
    data: { notificationPreferences: toJson(config) },
  });
  return config;
}

export async function createNotificationForUser(
  prisma: PrismaClient,
  input: CreateNotificationInput,
) {
  if (input.eventKey) {
    const config = await getNotificationConfig(prisma, input.userId);
    if (config.settings.events[input.eventKey] === false) return null;
  }

  return prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      title: input.title.slice(0, 240),
      body: input.body,
      payload: toJson(input.payload || {}),
    },
  });
}

export async function createNotificationForOrganization(
  prisma: PrismaClient,
  input: Omit<CreateNotificationInput, 'userId'> & { excludeUserIds?: string[] },
) {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId: input.organizationId,
      status: 'ACTIVE',
      userId: { notIn: input.excludeUserIds || [] },
    },
    select: { userId: true },
  });

  const created = [];
  for (const member of members) {
    const notification = await createNotificationForUser(prisma, {
      organizationId: input.organizationId,
      userId: member.userId,
      ...(input.eventKey ? { eventKey: input.eventKey } : {}),
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.payload ? { payload: input.payload } : {}),
    });
    if (notification) created.push(notification);
  }
  return created;
}

export async function createNotificationForUsers(
  prisma: PrismaClient,
  input: Omit<CreateNotificationInput, 'userId'> & { userIds: string[] },
) {
  const uniqueUserIds = [...new Set(input.userIds)];
  const activeMembers = await prisma.organizationMember.findMany({
    where: {
      organizationId: input.organizationId,
      status: 'ACTIVE',
      userId: { in: uniqueUserIds },
    },
    select: { userId: true },
  });

  const created = [];
  for (const member of activeMembers) {
    const notification = await createNotificationForUser(prisma, {
      organizationId: input.organizationId,
      userId: member.userId,
      ...(input.eventKey ? { eventKey: input.eventKey } : {}),
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.payload ? { payload: input.payload } : {}),
    });
    if (notification) created.push(notification);
  }
  return created;
}
