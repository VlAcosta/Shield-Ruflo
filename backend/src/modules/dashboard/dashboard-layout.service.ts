import type { FastifyInstance } from 'fastify';
import type { DashboardLayoutInput } from './dashboard-layout.schemas.js';

export async function getPersistedDashboardLayout(
  app: FastifyInstance,
  organizationId: string,
  userId: string,
) {
  const preference = await app.prisma.dashboardLayoutPreference.findFirst({
    where: { organizationId, userId },
    select: { layout: true, version: true, updatedAt: true },
  });

  if (!preference) {
    return { layout: null, version: null, updatedAt: null };
  }

  return {
    layout: preference.layout,
    version: preference.version,
    updatedAt: preference.updatedAt.toISOString(),
  };
}

export async function savePersistedDashboardLayout(
  app: FastifyInstance,
  organizationId: string,
  userId: string,
  layout: DashboardLayoutInput,
) {
  const existing = await app.prisma.dashboardLayoutPreference.findFirst({
    where: { organizationId, userId },
    select: { id: true },
  });

  const preference = existing
    ? await app.prisma.dashboardLayoutPreference.update({
        where: { id: existing.id },
        data: { layout, version: layout.version },
        select: { layout: true, version: true, updatedAt: true },
      })
    : await app.prisma.dashboardLayoutPreference.create({
        data: {
          organizationId,
          userId,
          layout,
          version: layout.version,
        },
        select: { layout: true, version: true, updatedAt: true },
      });

  return {
    layout: preference.layout,
    version: preference.version,
    updatedAt: preference.updatedAt.toISOString(),
  };
}

export async function resetPersistedDashboardLayout(
  app: FastifyInstance,
  organizationId: string,
  userId: string,
) {
  await app.prisma.dashboardLayoutPreference.deleteMany({
    where: { organizationId, userId },
  });
  return { reset: true };
}
