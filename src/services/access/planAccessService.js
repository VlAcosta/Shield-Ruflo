import { hasPermission, resolvePermissions } from './rbacService';

/**
 * These permissions are removed server-side when the active plan does not
 * contain the corresponding entitlement. This list is explanatory only:
 * backend authorization remains the source of truth for every request.
 */
export const PLAN_GATED_PERMISSIONS = Object.freeze([
  'analytics.view',
  'automations.view',
  'automations.manage',
  'reports.view',
  'reports.create',
  'reports.export',
  'competitive.view',
  'competitive.manage',
  'ai_visibility.view',
  'ai_visibility.manage',
  'ai_visibility.run',
]);

export function getPermissionAccessState(permission, context) {
  if (!permission || hasPermission(permission, context)) return 'allowed';
  if (!PLAN_GATED_PERMISSIONS.includes(permission)) return 'role_denied';

  const rolePermissions = resolvePermissions(context?.roleId, context?.overrides || {});
  return rolePermissions.includes(permission) ? 'plan_locked' : 'role_denied';
}

export function isPlanLocked(permission, context) {
  return getPermissionAccessState(permission, context) === 'plan_locked';
}
