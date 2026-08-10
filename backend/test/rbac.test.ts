import { describe, expect, it } from 'vitest';
import { permissionsForRole, roleHasPermission } from '../src/core/rbac/permissions.js';

describe('organization RBAC matrix', () => {
  it('gives OWNER full company and billing management access', () => {
    expect(roleHasPermission('OWNER', 'business.manage')).toBe(true);
    expect(roleHasPermission('OWNER', 'locations.manage')).toBe(true);
    expect(roleHasPermission('OWNER', 'billing.manage')).toBe(true);
    expect(roleHasPermission('OWNER', 'team.manage')).toBe(true);
    expect(roleHasPermission('OWNER', 'integrations.manage')).toBe(true);
    expect(roleHasPermission('OWNER', 'automations.manage')).toBe(true);
    expect(roleHasPermission('OWNER', 'analytics.view')).toBe(true);
  });

  it('keeps ADMIN away from owner-only billing management', () => {
    expect(roleHasPermission('ADMIN', 'business.manage')).toBe(true);
    expect(roleHasPermission('ADMIN', 'billing.manage')).toBe(false);
  });

  it('keeps ANALYST read-only', () => {
    expect(roleHasPermission('ANALYST', 'dashboard.view')).toBe(true);
    expect(roleHasPermission('ANALYST', 'reviews.reply')).toBe(false);
    expect(roleHasPermission('ANALYST', 'business.manage')).toBe(false);
  });

  it('fails closed for unknown roles', () => {
    expect(permissionsForRole('unexpected')).toEqual([]);
  });
});
