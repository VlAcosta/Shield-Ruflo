import { describe, expect, it } from 'vitest';
import { effectivePermissions } from '../src/core/rbac/permissions.js';
import { assertRoleAssignmentAllowed, frontendRoleId, normalizeOrganizationRole } from '../src/modules/team/team.service.js';
import { createInvitationSchema } from '../src/modules/team/team.schemas.js';

describe('B5 team access policy', () => {
  it('normalizes frontend role aliases into backend roles', () => {
    expect(normalizeOrganizationRole('owner')).toBe('OWNER');
    expect(normalizeOrganizationRole('moderator')).toBe('MANAGER');
    expect(normalizeOrganizationRole('guest')).toBe('ANALYST');
    expect(frontendRoleId('MANAGER')).toBe('manager');
    expect(frontendRoleId('ANALYST')).toBe('analyst');
    expect(frontendRoleId('MEMBER')).toBe('member');
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

  it('does not allow overrides to revive an unknown role', () => {
    expect(effectivePermissions('CORRUPTED_ROLE', { allow: ['billing.manage'] })).toEqual([]);
  });

  it('does not delegate owner-only permissions through stored overrides', () => {
    expect(effectivePermissions('MEMBER', { allow: ['billing.manage'] })).not.toContain('billing.manage');
  });

  it('keeps essential owner authority despite legacy stored denials', () => {
    const permissions = effectivePermissions('OWNER', { deny: ['team.manage', 'billing.manage'] });
    expect(permissions).toContain('team.manage');
    expect(permissions).toContain('billing.manage');
  });

  it('enforces a role assignment ceiling and prohibits self-promotion', () => {
    expect(() => assertRoleAssignmentAllowed('OWNER', 'ADMIN')).not.toThrow();
    expect(() => assertRoleAssignmentAllowed('ADMIN', 'ADMIN')).toThrowError(expect.objectContaining({ code: 'ROLE_ASSIGNMENT_FORBIDDEN' }));
    expect(() => assertRoleAssignmentAllowed('OWNER', 'OWNER')).toThrowError(expect.objectContaining({ code: 'OWNER_ROLE_RESTRICTED' }));
    expect(() => assertRoleAssignmentAllowed('ADMIN', 'ADMIN', { isSelf: true, currentRole: 'MANAGER' }))
      .toThrowError(expect.objectContaining({ code: 'CANNOT_PROMOTE_SELF' }));
    expect(() => assertRoleAssignmentAllowed('MANAGER', 'MEMBER', { currentRole: 'ADMIN' }))
      .toThrowError(expect.objectContaining({ code: 'ROLE_ASSIGNMENT_FORBIDDEN' }));
  });

  it('rejects unknown permission override names at the HTTP boundary', () => {
    expect(() => createInvitationSchema.parse({
      name: 'Operator',
      email: 'operator@example.test',
      role: 'MEMBER',
      permissionOverrides: { allow: ['root.shell'] },
    })).toThrow();
  });
});
