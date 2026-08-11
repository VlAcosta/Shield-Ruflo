import { effectivePermissions, permissionsForEntitlements, type PlanEntitlements } from '../../core/rbac/permissions.js';
import type { PublicUser } from './auth.types.js';

type SubscriptionForAccess = {
  status: string;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  plan: {
    code: string;
    entitlements: Array<{ key: string; value: unknown }>;
  };
};

export type PresentableMembership = {
  id: string;
  organizationId: string;
  role: string;
  status: string;
  accessExpiresAt?: Date | null;
  permissionOverrides?: unknown;
  createdAt: Date;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    onboardingStatus: string;
    subscriptions: SubscriptionForAccess[];
  };
};

type UserWithMemberships = {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  position?: string | null;
  telegram?: string | null;
  avatarUrl?: string | null;
  status: string;
  phoneVerifiedAt: Date | null;
  profileCompletedAt: Date | null;
  createdAt: Date;
  memberships: PresentableMembership[];
};

function membershipIsUsable(membership: PresentableMembership, now = new Date()): boolean {
  return membership.status === 'ACTIVE'
    && membership.organization.status === 'ACTIVE'
    && (!membership.accessExpiresAt || membership.accessExpiresAt > now);
}

function activePlanEntitlements(membership: PresentableMembership, now = new Date()): PlanEntitlements {
  const subscription = membership.organization.subscriptions.find((item) => (
    item.status !== 'TRIALING' || !item.currentPeriodEnd || item.currentPeriodEnd > now
  ));

  if (!subscription) return {};
  return Object.fromEntries(subscription.plan.entitlements.map((item) => [item.key, item.value]));
}

export function presentMembershipPermissions(membership: PresentableMembership, now = new Date()) {
  const rolePermissions = effectivePermissions(
    membership.role,
    membership.permissionOverrides as { allow?: string[]; deny?: string[] } | null,
  );
  return permissionsForEntitlements(rolePermissions, activePlanEntitlements(membership, now));
}

export function presentUser(user: UserWithMemberships, activeOrganizationId?: string | null): PublicUser {
  const now = new Date();
  const usable = user.memberships.filter((item) => membershipIsUsable(item, now));
  const membership = activeOrganizationId === null
    ? undefined
    : usable.find((item) => item.organizationId === activeOrganizationId) ?? usable[0];

  return {
    id: user.id,
    phone: user.phone,
    email: user.email ?? '',
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    displayName: user.displayName ?? '',
    position: user.position ?? '',
    telegram: user.telegram ?? '',
    avatarUrl: user.avatarUrl ?? '',
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
    profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    membership: membership
      ? {
          id: membership.id,
          organizationId: membership.organizationId,
          role: membership.role,
          status: membership.status,
          permissions: presentMembershipPermissions(membership, now),
          permissionOverrides: (membership.permissionOverrides as { allow?: string[]; deny?: string[] } | null) || { allow: [], deny: [] },
          accessExpiresAt: membership.accessExpiresAt?.toISOString() ?? null,
          securityStatus: 'active',
          organization: {
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            onboardingStatus: membership.organization.onboardingStatus,
          },
        }
      : null,
  };
}

export const publicUserInclude = {
  memberships: {
    where: {
      status: 'ACTIVE' as const,
      organization: { status: 'ACTIVE' as const },
    },
    orderBy: { createdAt: 'asc' as const },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          onboardingStatus: true,
          subscriptions: {
            where: {
              status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] as const },
            },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: {
              status: true,
              currentPeriodEnd: true,
              createdAt: true,
              plan: {
                select: {
                  code: true,
                  entitlements: {
                    select: { key: true, value: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
