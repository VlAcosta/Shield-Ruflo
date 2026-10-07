import type { PrismaClient } from '../../generated/prisma/client.js';

type LeaseIdentity = {
  jobId: string;
  workerId: string;
};

export async function renewJobLease(prisma: PrismaClient, input: LeaseIdentity): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: {
      id: input.jobId,
      status: 'RUNNING',
      lockToken: input.workerId,
    },
    data: { lockedAt: new Date() },
  });
  return result.count === 1;
}

export async function completeJobLease(prisma: PrismaClient, input: LeaseIdentity): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: {
      id: input.jobId,
      status: 'RUNNING',
      lockToken: input.workerId,
    },
    data: {
      status: 'SUCCEEDED',
      completedAt: new Date(),
      lockedAt: null,
      lockToken: null,
      lastError: null,
    },
  });
  return result.count === 1;
}

export async function failJobLease(
  prisma: PrismaClient,
  input: LeaseIdentity & {
    exhausted: boolean;
    message: string;
    nextRunAt: Date | null;
  },
): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: {
      id: input.jobId,
      status: 'RUNNING',
      lockToken: input.workerId,
    },
    data: input.exhausted
      ? {
          status: 'DEAD',
          completedAt: new Date(),
          lastError: input.message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
        }
      : {
          status: 'QUEUED',
          completedAt: null,
          lastError: input.message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
          runAt: input.nextRunAt ?? new Date(),
        },
  });
  return result.count === 1;
}
