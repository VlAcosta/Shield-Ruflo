import type { Permission } from '../../core/rbac/permissions.js';

export type ApiPrincipal = {
  type: 'SERVICE_ACCOUNT';
  organizationId: string;
  serviceAccountId: string;
  apiKeyId: string;
  apiKeyPrefix: string;
  name: string;
  permissions: Permission[];
};
