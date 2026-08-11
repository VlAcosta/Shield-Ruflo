import type { FastifyInstance } from 'fastify';

export async function provisionTestPlan(
  app: FastifyInstance,
  organizationIds: readonly string[],
  planCode: 'FREE' | 'PRO' = 'PRO',
) {
  const plan = await app.prisma.plan.findFirst({
    where: { code: planCode, active: true },
    select: { id: true },
  });

  if (!plan) {
    throw new Error(`Test plan ${planCode} is not configured. Apply test migrations before fixtures.`);
  }

  await app.prisma.subscription.createMany({
    data: organizationIds.map((organizationId) => ({
      organizationId,
      planId: plan.id,
      status: 'ACTIVE' as const,
      provider: 'test_fixture',
      autoRenew: false,
    })),
  });
}
