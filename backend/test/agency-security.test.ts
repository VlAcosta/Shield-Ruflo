import { describe, expect, it } from 'vitest';
import {
  delegatedPermissionAllowlist,
  sanitizeDelegatedPermissions,
} from '../src/core/rbac/permissions.js';
import { resolveActiveMembership } from '../src/core/plugins/authentication.js';
import { createAgencyInvitationSchema } from '../src/modules/agency/agency.schemas.js';

describe('P26 delegated agency security', () => {
  it('drops administrative permissions even when they are injected into stored scopes', () => {
    expect(sanitizeDelegatedPermissions([
      'reviews.view',
      'reviews.reply',
      'billing.manage',
      'team.manage',
      'integrations.manage',
      'agency.manage',
      'reviews.reply',
      'totally.fake.permission',
    ])).toEqual(['reviews.view', 'reviews.reply']);
  });

  it('keeps the delegated allowlist free from tenant-admin capabilities', () => {
    expect(delegatedPermissionAllowlist).not.toContain('billing.manage');
    expect(delegatedPermissionAllowlist).not.toContain('team.manage');
    expect(delegatedPermissionAllowlist).not.toContain('integrations.manage');
    expect(delegatedPermissionAllowlist).not.toContain('agency.manage');
  });

  it('does not fall back to an unrelated direct membership for an explicitly selected workspace', () => {
    const memberships = [
      { organizationId: '11111111-1111-4111-8111-111111111111', role: 'OWNER' },
      { organizationId: '22222222-2222-4222-8222-222222222222', role: 'MEMBER' },
    ];

    expect(resolveActiveMembership(memberships, '22222222-2222-4222-8222-222222222222')).toEqual(memberships[1]);
    expect(resolveActiveMembership(memberships, '33333333-3333-4333-8333-333333333333')).toBeNull();
    expect(resolveActiveMembership(memberships, null)).toBeNull();
  });

  it('requires a non-empty delegated scope list and validates grant expiry format', () => {
    expect(createAgencyInvitationSchema.safeParse({
      clientOrganizationId: '22222222-2222-4222-8222-222222222222',
      permissions: [],
    }).success).toBe(false);

    expect(createAgencyInvitationSchema.safeParse({
      clientOrganizationId: '22222222-2222-4222-8222-222222222222',
      permissions: ['reviews.view'],
      grantExpiresAt: 'not-a-date',
    }).success).toBe(false);

    expect(createAgencyInvitationSchema.safeParse({
      clientOrganizationId: '22222222-2222-4222-8222-222222222222',
      permissions: ['reviews.view'],
      grantExpiresAt: '2027-08-12T10:00:00.000Z',
    }).success).toBe(true);
  });
});
