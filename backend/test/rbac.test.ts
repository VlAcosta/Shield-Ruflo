import { describe, expect, it } from 'vitest';
import { permissionsForRole, roleHasPermission } from '../src/core/rbac/permissions.js';

describe('organization RBAC matrix', () => {
  it('gives OWNER full company and billing management access', () => {
    expect(roleHasPermission('OWNER', 'company.edit')).toBe(true);
    expect(roleHasPermission('OWNER', 'billing.manage')).toBe(true);
    expect(roleHasPermission('OWNER', 'team.manage_roles')).toBe(true);
  });

  it('keeps ADMIN away from owner-only billing management', () => {
    expect(roleHasPermission('ADMIN', 'company.edit')).toBe(true);
    expect(roleHasPermission('ADMIN', 'billing.manage')).toBe(false);
  });

  it('keeps ANALYST read-only', () => {
    expect(roleHasPermission('ANALYST', 'dashboard.view')).toBe(true);
    expect(roleHasPermission('ANALYST', 'reviews.reply')).toBe(false);
    expect(roleHasPermission('ANALYST', 'company.edit')).toBe(false);
  });

  it('falls back to MEMBER permissions for unknown roles', () => {
    expect(permissionsForRole('unexpected')).toContain('dashboard.view');
    expect(permissionsForRole('unexpected')).not.toContain('billing.manage');
  });
});
