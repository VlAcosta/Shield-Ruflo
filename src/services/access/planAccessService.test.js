import { getCurrentAccessContext } from './rbacService';
import { getPermissionAccessState } from './planAccessService';

describe('plan access state', () => {
  test('explains a premium permission removed by the active plan', () => {
    const context = getCurrentAccessContext({
      organizationId: 'org-free',
      role: 'OWNER',
      permissions: ['dashboard.view', 'reviews.view', 'billing.view'],
    });
    expect(getPermissionAccessState('analytics.view', context)).toBe('plan_locked');
    expect(getPermissionAccessState('automations.view', context)).toBe('plan_locked');
  });

  test('does not label a true role denial as a plan lock', () => {
    const context = getCurrentAccessContext({
      organizationId: 'org-member',
      role: 'MEMBER',
      permissions: ['dashboard.view', 'reviews.view'],
    });
    expect(getPermissionAccessState('analytics.view', context)).toBe('role_denied');
    expect(getPermissionAccessState('billing.manage', context)).toBe('role_denied');
  });

  test('keeps a granted premium permission allowed', () => {
    const context = getCurrentAccessContext({
      organizationId: 'org-pro',
      role: 'MANAGER',
      permissions: ['analytics.view'],
    });
    expect(getPermissionAccessState('analytics.view', context)).toBe('allowed');
  });
});
