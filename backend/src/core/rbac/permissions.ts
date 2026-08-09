export const permissions = [
  'dashboard.view',
  'dashboard.edit',
  'reviews.view',
  'reviews.reply',
  'reviews.moderate',
  'reviews.approve',
  'reviews.legal',
  'reviews.settings',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'tasks.delete',
  'reports.view',
  'reports.create',
  'reports.export',
  'billing.view',
  'billing.manage',
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
  'reviews.view',
  'tasks.view',
  'reports.view',
  'reports.export',
  'billing.view',
  'company.view',
  'team.view',
  'support.view',
];

const manager: Permission[] = [
  'dashboard.view', 'dashboard.edit',
  'reviews.view', 'reviews.reply', 'reviews.moderate', 'reviews.legal',
  'tasks.view', 'tasks.create', 'tasks.edit',
  'reports.view', 'reports.create', 'reports.export',
  'billing.view',
  'company.view',
  'team.view',
  'support.view', 'support.write',
];

const member: Permission[] = [
  'dashboard.view',
  'reviews.view', 'reviews.reply',
  'tasks.view', 'tasks.create', 'tasks.edit',
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
  return [...(rolePermissions[normalized] ?? rolePermissions.MEMBER)];
}

export function roleHasPermission(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export type PermissionOverrides = {
  allow?: string[];
  deny?: string[];
};

export function effectivePermissions(role: string, overrides: PermissionOverrides | null | undefined): Permission[] {
  const allowed = new Set<Permission>(permissionsForRole(role));
  for (const permission of overrides?.allow ?? []) {
    if ((permissions as readonly string[]).includes(permission)) allowed.add(permission as Permission);
  }
  for (const permission of overrides?.deny ?? []) {
    if ((permissions as readonly string[]).includes(permission)) allowed.delete(permission as Permission);
  }
  return [...allowed];
}
