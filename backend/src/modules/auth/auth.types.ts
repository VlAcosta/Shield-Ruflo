import type { Permission } from '../../core/rbac/permissions.js';

export type PublicMembership = {
  id: string;
  organizationId: string;
  role: string;
  status: string;
  permissions: Permission[];
  permissionOverrides?: { allow?: string[]; deny?: string[] };
  accessExpiresAt: string | null;
  securityStatus: 'active' | 'frozen';
  organization: {
    id: string;
    name: string;
    slug: string;
    onboardingStatus: string;
  };
};

export type PublicUser = {
  id: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  position?: string;
  telegram?: string;
  avatarUrl?: string;
  status: string;
  phoneVerifiedAt: string | null;
  profileCompletedAt: string | null;
  createdAt: string;
  membership: PublicMembership | null;
};

export type AuthContext = {
  sessionId: string;
  tokenHash: string;
  userId: string;
  organizationId: string | null;
  membershipId: string | null;
  role: string | null;
  permissions: Permission[];
  permissionOverrides?: { allow?: string[]; deny?: string[] };
  user: PublicUser;
};
