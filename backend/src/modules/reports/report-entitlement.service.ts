import type { PrismaClient } from '../../generated/prisma/client.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] as const;

export async function reportEntitledOrganizationIds(
  prisma: PrismaClient,
  organizationIds: string[],
  now = new Date(),
): Promise<Set<string>> {
  if (!organizationIds.length) return new Set();

  const subscriptions = await prisma.subscription.findMany({
    where: {
      organizationId: { in: organizationIds },
      status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      organizationId: true,
      status: true,
      currentPeriodEnd: true,
      plan: {
        select: {
          entitlements: {
            where: { key: 'reports' },
            select: { key: true, value: true },
          },
        },
      },
    },
  });

  // A repository can temporarily contain more than one subscription in an
  // active-like status while provider webhooks converge. Match billing.service
  // semantics by evaluating only the newest subscription for each tenant.
  const resolved = new Set<string>();
  const entitled = new Set<string>();
  for (const subscription of subscriptions) {
    if (resolved.has(subscription.organizationId)) continue;
    resolved.add(subscription.organizationId);

    if (
      subscription.status === 'TRIALING'
      && subscription.currentPeriodEnd
      && subscription.currentPeriodEnd <= now
    ) continue;

    if (subscription.plan.entitlements.some((item) => item.key === 'reports' && item.value === true)) {
      entitled.add(subscription.organizationId);
    }
  }
  return entitled;
}

export async function hasReportsEntitlement(
  prisma: PrismaClient,
  organizationId: string,
  now = new Date(),
): Promise<boolean> {
  const entitled = await reportEntitledOrganizationIds(prisma, [organizationId], now);
  return entitled.has(organizationId);
}
