export const permissions = [
  'dashboard.view',
  'business.view',
  'business.manage',
  'locations.view',
  'locations.manage',
  'dashboard.edit',
  'reviews.view',
  'reviews.reply',
  'reviews.moderate',
  'reviews.approve',
  'reviews.legal',
  'reviews.settings',
  'reviews.intelligence.read',
  'reviews.intelligence.reanalyze',
  'cases.view',
  'cases.manage',
  'cases.verify',
  'acquisition.view',
  'acquisition.manage',
  'competitive.view',
  'competitive.manage',
  'ai_visibility.view',
  'ai_visibility.manage',
  'ai_visibility.run',
  'ai.brand_voice.manage',
  'ai.autopilot.manage',
  'tasks.view',
  'tasks.manage',
  'tasks.create',
  'tasks.edit',
  'tasks.delete',
  'reports.view',
  'reports.create',
  'reports.export',
  'billing.view',
  'billing.manage',
  'integrations.view',
  'integrations.manage',
  'automations.view',
  'automations.manage',
  'analytics.view',
  'team.manage',
  // Legacy capabilities retained in responses while existing clients migrate.
  'company.view',
  'company.edit',
  'team.view',
  'team.invite',
  'team.manage_roles',
  'team.manage_security',
  'team.remove',
  'support.view',
  'support.write',
] as const;

export type Permission = (typeof permissions)[number];
export type OrganizationRoleName = 'OWNER' | 'ADMIN' | 'MANAGER' | 'ANALYST' | 'MEMBER';

const all = [...permissions] as Permission[];
const readOnly: Permission[] = [
  'dashboard.view',
  'business.view',
  'locations.view',
  'reviews.view',
  'reviews.intelligence.read',
  'cases.view',
  'acquisition.view',
  'competitive.view',
  'ai_visibility.view',
  'tasks.view',
  'integrations.view',
  'automations.view',
  'analytics.view',
  'reports.view',
  'reports.export',
  'billing.view',
  'company.view',
  'team.view',
  'support.view',
];

const manager: Permission[] = [
  'dashboard.view', 'dashboard.edit',
  'business.view', 'business.manage', 'locations.view', 'locations.manage',
  'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal', 'reviews.intelligence.read', 'reviews.intelligence.reanalyze',
  'cases.view', 'cases.manage', 'cases.verify',
  'acquisition.view', 'acquisition.manage',
  'competitive.view', 'competitive.manage',
  'ai_visibility.view', 'ai_visibility.manage', 'ai_visibility.run',
  'tasks.view', 'tasks.manage', 'tasks.create', 'tasks.edit',
  'integrations.view', 'automations.view', 'analytics.view',
  'reports.view', 'reports.create', 'reports.export',
  'billing.view',
  'company.view',
  'team.view',
  'support.view', 'support.write',
];

const member: Permission[] = [
  'dashboard.view',
  'business.view', 'locations.view',
  'reviews.view', 'reviews.reply', 'reviews.intelligence.read',
  'cases.view',
  'acquisition.view',
  'competitive.view',
  'ai_visibility.view',
  'tasks.view', 'tasks.create', 'tasks.edit',
  'integrations.view', 'automations.view',
  'reports.view',
  'company.view',
  'team.view',
  'support.view', 'support.write',
];

export const rolePermissions: Readonly<Record<OrganizationRoleName, readonly Permission[]>> = Object.freeze({
  OWNER: Object.freeze(all),
  ADMIN: Object.freeze(all.filter((permission) => permission !== 'billing.manage')),
  MANAGER: Object.freeze(manager),
  ANALYST: Object.freeze(readOnly),
  MEMBER: Object.freeze(member),
});

export function permissionsForRole(role: string): Permission[] {
  const normalized = role.toUpperCase() as OrganizationRoleName;
  return [...(rolePermissions[normalized] ?? [])];
}

export function roleHasPermission(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export type PermissionOverrides = {
  allow?: string[];
  deny?: string[];
};

export const nonDelegablePermissions: readonly Permission[] = Object.freeze([
  'billing.manage',
]);

/** Permissions an OWNER must retain so an organization cannot be administratively locked. */
export const essentialOwnerPermissions: readonly Permission[] = Object.freeze([
  'team.manage',
  'billing.manage',
]);

export function isPermission(value: string): value is Permission {
  return (permissions as readonly string[]).includes(value);
}

export function isNonDelegablePermission(value: string): value is Permission {
  return isPermission(value) && nonDelegablePermissions.includes(value);
}

export function effectivePermissions(role: string, overrides: PermissionOverrides | null | undefined): Permission[] {
  const normalizedRole = role.toUpperCase();
  const basePermissions = permissionsForRole(normalizedRole);
  if (basePermissions.length === 0) return [];
  const allowed = new Set<Permission>(basePermissions);
  for (const permission of overrides?.allow ?? []) {
    if (isPermission(permission) && !isNonDelegablePermission(permission)) allowed.add(permission);
  }
  for (const permission of overrides?.deny ?? []) {
    if (
      isPermission(permission)
      && !(normalizedRole === 'OWNER' && essentialOwnerPermissions.includes(permission))
    ) allowed.delete(permission);
  }
  return [...allowed];
}
