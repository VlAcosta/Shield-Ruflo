import { describe, expect, it } from 'vitest';
import {
  mergeNotificationPreferences,
  mergeNotificationSettings,
  normalizeNotificationConfig,
} from '../src/modules/notifications/notifications.service.js';

describe('notification config normalization', () => {
  it('returns complete defaults for an empty account', () => {
    expect(normalizeNotificationConfig(null)).toEqual({
      preferences: { activeTab: 'unread', activeType: 'all' },
      settings: {
        channels: { email: false, telegram: false, push: false, sms: false },
        events: {
          review: true,
          overdueTask: true,
          completedTask: true,
          reportReady: true,
          message: true,
          subscription: true,
        },
        quietHours: { enabled: false, from: '22:00', to: '09:00' },
      },
    });
  });

  it('does not expose legacy unconfigured delivery channels as enabled', () => {
    const config = normalizeNotificationConfig({
      settings: {
        channels: { email: true, telegram: true, push: true, sms: true },
      },
    });

    expect(config.settings.channels).toEqual({
      email: false,
      telegram: false,
      push: false,
      sms: false,
    });
  });

  it('deep-merges partial settings without deleting sibling values', () => {
    const current = normalizeNotificationConfig(null);
    const first = mergeNotificationSettings(current.settings, {
      events: { review: false },
      quietHours: { enabled: true },
    });
    const second = mergeNotificationSettings(first, {
      quietHours: { from: '23:15' },
    });

    expect(second).toMatchObject({
      channels: { email: false, telegram: false, push: false, sms: false },
      events: {
        review: false,
        completedTask: true,
        reportReady: true,
        message: true,
      },
      quietHours: { enabled: true, from: '23:15', to: '09:00' },
    });
  });

  it('merges preferences independently', () => {
    expect(mergeNotificationPreferences(
      { activeTab: 'unread', activeType: 'all' },
      { activeType: 'tasks' },
    )).toEqual({ activeTab: 'unread', activeType: 'tasks' });
  });
});
