import type { PrismaClient } from '../../generated/prisma/client.js';

type JobLeaseClient = Pick<PrismaClient, 'job'>;

export const JOB_LEASE_TIMEOUT_MS = 5 * 60_000;
export const JOB_LEASE_HEARTBEAT_MS = 60_000;

export async function renewJobLease(
  prisma: JobLeaseClient,
  input: { jobId: string; lockToken: string; now?: Date },
): Promise<boolean> {
  const updated = await prisma.job.updateMany({
    where: {
      id: input.jobId,
      status: 'RUNNING',
      lockToken: input.lockToken,
    },
    data: {
      lockedAt: input.now ?? new Date(),
    },
  });

  return updated.count === 1;
}

export async function finishJobLeaseSuccess(
  prisma: JobLeaseClient,
  input: { jobId: string; lockToken: string; completedAt?: Date },
): Promise<boolean> {
  const updated = await prisma.job.updateMany({
    where: {
      id: input.jobId,
      status: 'RUNNING',
      lockToken: input.lockToken,
    },
    data: {
      status: 'SUCCEEDED',
      completedAt: input.completedAt ?? new Date(),
      lockedAt: null,
      lockToken: null,
      lastError: null,
    },
  });

  return updated.count === 1;
}

export async function finishJobLeaseFailure(
  prisma: JobLeaseClient,
  input: {
    jobId: string;
    lockToken: string;
    exhausted: boolean;
    error: string;
    nextRunAt: Date | null;
    completedAt?: Date;
  },
): Promise<boolean> {
  const message = input.error.slice(0, 4000);
  const updated = await prisma.job.updateMany({
    where: {
      id: input.jobId,
      status: 'RUNNING',
      lockToken: input.lockToken,
    },
    data: input.exhausted
      ? {
          status: 'DEAD',
          completedAt: input.completedAt ?? new Date(),
          lastError: message,
          lockedAt: null,
          lockToken: null,
        }
      : {
          status: 'QUEUED',
          completedAt: null,
          lastError: message,
          lockedAt: null,
          lockToken: null,
          runAt: input.nextRunAt ?? new Date(),
        },
  });

  return updated.count === 1;
}
