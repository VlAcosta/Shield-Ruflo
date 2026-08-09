import { describe, expect, it } from 'vitest';
import { effectivePermissions } from '../src/core/rbac/permissions.js';
import { frontendRoleId, normalizeOrganizationRole } from '../src/modules/team/team.service.js';

describe('B5 team access policy', () => {
  it('normalizes frontend role aliases into backend roles', () => {
    expect(normalizeOrganizationRole('owner')).toBe('OWNER');
    expect(normalizeOrganizationRole('moderator')).toBe('MANAGER');
    expect(normalizeOrganizationRole('guest')).toBe('ANALYST');
    expect(frontendRoleId('MANAGER')).toBe('moderator');
  });

  it('applies permission overrides on top of the system role', () => {
    const permissions = effectivePermissions('ANALYST', {
      allow: ['reviews.reply'],
      deny: ['reports.export'],
    });
    expect(permissions).toContain('reviews.reply');
    expect(permissions).not.toContain('reports.export');
    expect(permissions).toContain('dashboard.view');
  });

  it('ignores unknown permissions instead of escalating access', () => {
    const permissions = effectivePermissions('MEMBER', { allow: ['root.shell', 'billing.manage.nope'] });
    expect(permissions).not.toContain('billing.manage');
    expect(permissions).not.toContain('root.shell');
  });
});
