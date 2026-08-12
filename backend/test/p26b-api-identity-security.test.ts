import { describe, expect, it } from 'vitest';
import {
  apiKeyPermissionAllowlist,
  sanitizeApiKeyPermissions,
} from '../src/core/rbac/permissions.js';

describe('P26-B service-account API scope security', () => {
  it('keeps service-account scopes read-only and strips administrative escalation', () => {
    expect(sanitizeApiKeyPermissions([
      'reviews.view',
      'dashboard.view',
      'billing.manage',
      'team.manage',
      'api_keys.manage',
      'integrations.manage',
      'reviews.reply',
    ])).toEqual(['reviews.view', 'dashboard.view']);

    expect(apiKeyPermissionAllowlist).toContain('reviews.view');
    expect(apiKeyPermissionAllowlist).toContain('dashboard.view');
    expect(apiKeyPermissionAllowlist).not.toContain('billing.manage');
    expect(apiKeyPermissionAllowlist).not.toContain('team.manage');
    expect(apiKeyPermissionAllowlist).not.toContain('api_keys.manage');
    expect(apiKeyPermissionAllowlist).not.toContain('reviews.reply');
  });
});
