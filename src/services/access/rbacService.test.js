import { getCurrentAccessContext, getRoleLabel, hasPermission, PRESET_ROLES } from './rbacService';

describe('server-authoritative RBAC UX context', () => {
  test('normalizes backend role names', () => {
    expect(getRoleLabel('OWNER')).toBe('Владелец');
    expect(getRoleLabel('manager')).toBe('Менеджер');
    expect(getRoleLabel('ANALYST')).toBe('Аналитик');
  });

  test('keeps canonical MEMBER distinct from legacy guest compatibility', () => {
    expect(getCurrentAccessContext({ role: 'MEMBER', accessRoleId: 'guest' }).roleId).toBe('MEMBER');
    expect(getCurrentAccessContext({ role: 'guest' }).roleId).toBe('ANALYST');
    expect(getRoleLabel('MEMBER')).toBe('Участник');
    expect(getRoleLabel('guest')).toBe('Аналитик');
  });

  test('uses the exact permissions returned by the backend, including an empty set', () => {
    const owner = getCurrentAccessContext({ role: 'OWNER', permissions: ['dashboard.view', 'reviews.view'] });
    expect(owner.isOwner).toBe(true);
    expect(hasPermission('reviews.view', owner)).toBe(true);
    expect(hasPermission('billing.manage', owner)).toBe(false);

    const restricted = getCurrentAccessContext({ role: 'ADMIN', permissions: [] });
    expect(restricted.permissions).toEqual([]);
    expect(hasPermission('dashboard.view', restricted)).toBe(false);
  });

  test('fails closed when a server organization membership omits or malforms permissions', () => {
    const missing = getCurrentAccessContext({
      organizationId: 'org-a',
      role: 'OWNER',
    });
    const malformed = getCurrentAccessContext({
      organization: { id: 'org-a' },
      role: 'ADMIN',
      permissions: 'dashboard.view',
    });

    expect(missing.permissions).toEqual([]);
    expect(hasPermission('billing.manage', missing)).toBe(false);
    expect(malformed.permissions).toEqual([]);
    expect(hasPermission('dashboard.view', malformed)).toBe(false);
  });

  test('retains role presets for explicit legacy contexts without an organization boundary', () => {
    const legacyPreview = getCurrentAccessContext({ role: 'guest' });

    expect(legacyPreview.roleId).toBe('ANALYST');
    expect(hasPermission('dashboard.view', legacyPreview)).toBe(true);
    expect(hasPermission('reviews.reply', legacyPreview)).toBe(false);
  });

  test('recognizes P2 granular permission names from the server', () => {
    const context = getCurrentAccessContext({
      role: 'MANAGER',
      permissions: ['business.manage', 'locations.view', 'tasks.manage', 'team.manage', 'analytics.view'],
    });
    expect(context.permissions).toEqual(['business.manage', 'locations.view', 'tasks.manage', 'team.manage', 'analytics.view']);
  });

  test('keeps role-preview permissions aligned with backend role policy', () => {
    const manager = PRESET_ROLES.find((role) => role.id === 'MANAGER');
    const member = PRESET_ROLES.find((role) => role.id === 'MEMBER');
    expect(manager.permissions).toContain('analytics.view');
    expect(member.permissions).toContain('reports.view');
  });
});
