import { describe, expect, it } from 'vitest';
import { effectivePermissions, permissionsForEntitlements } from '../src/core/rbac/permissions.js';

const FREE = {
  analytics: false,
  automations: false,
  reports: false,
  competitive: false,
  aiVisibility: false,
  aiFeatures: false,
};

const PRO = {
  analytics: true,
  automations: true,
  reports: true,
  competitive: true,
  aiVisibility: true,
  aiFeatures: true,
};

describe('plan-aware permissions', () => {
  it('keeps core workspace capabilities available on FREE', () => {
    const permissions = permissionsForEntitlements(effectivePermissions('OWNER', null), FREE);

    expect(permissions).toContain('dashboard.view');
    expect(permissions).toContain('reviews.view');
    expect(permissions).toContain('reviews.reply');
    expect(permissions).toContain('tasks.view');
    expect(permissions).toContain('billing.manage');
  });

  it('removes premium capabilities from FREE even for OWNER', () => {
    const permissions = permissionsForEntitlements(effectivePermissions('OWNER', null), FREE);

    expect(permissions).not.toContain('analytics.view');
    expect(permissions).not.toContain('automations.manage');
    expect(permissions).not.toContain('reports.export');
    expect(permissions).not.toContain('competitive.view');
    expect(permissions).not.toContain('ai_visibility.run');
    expect(permissions).not.toContain('reviews.intelligence.read');
    expect(permissions).not.toContain('ai.autopilot.manage');
  });

  it('restores premium capabilities on PRO while preserving role restrictions', () => {
    const ownerPermissions = permissionsForEntitlements(effectivePermissions('OWNER', null), PRO);
    const memberPermissions = permissionsForEntitlements(effectivePermissions('MEMBER', null), PRO);

    expect(ownerPermissions).toContain('analytics.view');
    expect(ownerPermissions).toContain('automations.manage');
    expect(ownerPermissions).toContain('reports.export');
    expect(ownerPermissions).toContain('competitive.manage');
    expect(ownerPermissions).toContain('ai_visibility.run');
    expect(ownerPermissions).toContain('reviews.intelligence.read');

    expect(memberPermissions).toContain('competitive.view');
    expect(memberPermissions).not.toContain('competitive.manage');
    expect(memberPermissions).not.toContain('billing.manage');
  });

  it('fails premium permissions closed when subscription entitlements are missing', () => {
    const permissions = permissionsForEntitlements(effectivePermissions('OWNER', null), {});

    expect(permissions).toContain('reviews.view');
    expect(permissions).not.toContain('analytics.view');
    expect(permissions).not.toContain('ai_visibility.view');
  });
});
