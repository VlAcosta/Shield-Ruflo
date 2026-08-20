import type { FastifyInstance } from 'fastify';

export async function getDashboardSecuritySnapshot(
  app: FastifyInstance,
  userId: string,
) {
  const now = new Date();
  const [activeSessions, recentSessions] = await Promise.all([
    app.prisma.session.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
    app.prisma.session.findMany({
      where: { userId },
      select: {
        lastSeenAt: true,
        createdAt: true,
        revokedAt: true,
        expiresAt: true,
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    }),
  ]);

  const latestActivity = recentSessions
    .map((session) => session.lastSeenAt ?? session.createdAt)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const revokedRecently = recentSessions.filter((session) => (
    session.revokedAt && now.getTime() - session.revokedAt.getTime() <= 30 * 86_400_000
  )).length;

  return {
    activeSessions,
    latestActivityAt: latestActivity?.toISOString() ?? null,
    revokedSessions30d: revokedRecently,
  };
}
