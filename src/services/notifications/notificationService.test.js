import { apiRequest } from '../core/apiClient';
import { getNotificationsSnapshot } from './notificationService';

vi.mock('../core/apiClient', async () => {
  const actual = await vi.importActual('../core/apiClient');
  return { ...actual, apiRequest: vi.fn() };
});
vi.mock('../core/dataScope', () => ({
  getAccountScope: () => 'notifications-test',
  readScopedJson: () => null,
  writeScopedJson: vi.fn(),
}));
vi.mock('../core/runtimeConfig', () => ({ isDemoDataEnabled: () => false }));

describe('notificationService API normalization', () => {
  beforeEach(() => apiRequest.mockReset());

  test('converts ISO createdAt values to epoch milliseconds', async () => {
    const createdAt = '2026-08-12T00:30:00.000Z';
    apiRequest.mockResolvedValue({
      notifications: [{
        id: 'n-1',
        title: 'Событие',
        body: 'Тест',
        status: 'UNREAD',
        createdAt,
      }],
    });

    const snapshot = await getNotificationsSnapshot();

    expect(snapshot.notifications[0]).toMatchObject({
      id: 'n-1',
      text: 'Тест',
      unread: true,
      createdAt: Date.parse(createdAt),
    });
  });

  test('normalizes invalid timestamps instead of leaking NaN into relative time', async () => {
    const before = Date.now();
    apiRequest.mockResolvedValue({
      notifications: [{ id: 'n-2', title: 'Событие', createdAt: 'not-a-date' }],
    });

    const snapshot = await getNotificationsSnapshot();
    const normalized = snapshot.notifications[0].createdAt;

    expect(Number.isFinite(normalized)).toBe(true);
    expect(normalized).toBeGreaterThanOrEqual(before);
    expect(normalized).toBeLessThanOrEqual(Date.now());
  });
});
