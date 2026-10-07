import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

type RecoverableJob = {
  id: string;
  organizationId: string | null;
  type: string;
  payload: Prisma.JsonValue;
  status: string;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  lockToken: string | null;
};

export const WORKER_LEASE_EXPIRED_CODE = 'WORKER_LEASE_EXPIRED';

function payloadObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function payloadString(job: Pick<RecoverableJob, 'payload'>, key: string): string {
  const value = payloadObject(job.payload)[key];
  return typeof value === 'string' ? value : '';
}

async function recoverDomainState(
  tx: Prisma.TransactionClient,
  job: RecoverableJob,
  now: Date,
): Promise<'requeued' | 'reconciliation'> {
  const message = 'Worker lease expired before the job completed.';

  if (job.type === 'integration.sync.reviews') {
    const syncRunId = payloadString(job, 'syncRunId');
    if (syncRunId) {
      await tx.integrationSyncRun.updateMany({
        where: { id: syncRunId, status: 'RUNNING' },
        data: {
          status: 'QUEUED',
          finishedAt: null,
          errorCode: WORKER_LEASE_EXPIRED_CODE,
          errorMessage: message,
        },
      });
    }
  }

  if (job.type === 'report.generate') {
    const reportId = payloadString(job, 'reportId');
    if (reportId) {
      await tx.report.updateMany({
        where: { id: reportId, status: 'GENERATING' },
        data: { status: 'QUEUED', errorMessage: WORKER_LEASE_EXPIRED_CODE },
      });
    }
  }

  if (job.type === 'ai.analyzeReview' || job.type === 'ai.generateReply') {
    const aiOperationId = payloadString(job, 'aiOperationId');
    if (aiOperationId) {
      await tx.aiOperation.updateMany({
        where: { id: aiOperationId, status: 'RUNNING' },
        data: {
          status: 'QUEUED',
          startedAt: null,
          completedAt: null,
          errorCode: WORKER_LEASE_EXPIRED_CODE,
          errorMessage: message,
        },
      });
    }
  }

  if (job.type === 'aiVisibility.run') {
    const runId = payloadString(job, 'runId');
    if (runId) {
      await tx.aiVisibilityRun.updateMany({
        where: { id: runId, status: 'RUNNING' },
        data: {
          status: 'QUEUED',
          startedAt: null,
          completedAt: null,
          errorCode: WORKER_LEASE_EXPIRED_CODE,
          errorMessage: message,
        },
      });
    }
  }

  if (job.type === 'askShield.answer') {
    const queryId = payloadString(job, 'queryId');
    if (queryId) {
      // Ask Shield currently models both queued and executing work as RUNNING.
      // Keep that public state, but record why the durable job was recovered.
      await tx.askShieldQuery.updateMany({
        where: { id: queryId, status: 'RUNNING' },
        data: {
          completedAt: null,
          errorCode: WORKER_LEASE_EXPIRED_CODE,
          errorMessage: message,
        },
      });
    }
  }

  if (job.type === 'provider.publishReply') {
    const organizationId = payloadString(job, 'organizationId') || job.organizationId || '';
    const reviewId = payloadString(job, 'reviewId');
    const replyId = payloadString(job, 'replyId');
    if (organizationId && reviewId && replyId) {
      const reply = await tx.reviewReply.findFirst({
        where: { id: replyId, organizationId, reviewId },
        select: { status: true, retryCount: true },
      });

      if (reply?.status === 'PUBLISHED') {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'SUCCEEDED',
            completedAt: now,
            lastError: WORKER_LEASE_EXPIRED_CODE,
          },
        });
        return 'reconciliation';
      }

      if (reply?.status === 'PUBLISHING' || reply?.status === 'PUBLISH_UNKNOWN') {
        const updated = reply.status === 'PUBLISHING'
          ? await tx.reviewReply.update({
              where: { id: replyId },
              data: {
                status: 'PUBLISH_UNKNOWN',
                failedReason: WORKER_LEASE_EXPIRED_CODE,
                retryCount: { increment: 1 },
              },
              select: { retryCount: true },
            })
          : { retryCount: reply.retryCount };

        const existingReconciliation = await tx.job.findFirst({
          where: {
            organizationId,
            type: 'provider.reconcileReply',
            status: { in: ['QUEUED', 'RUNNING'] },
            payload: { path: ['replyId'], equals: replyId },
          },
          select: { id: true },
        });

        if (!existingReconciliation) {
          await tx.job.create({
            data: {
              organizationId,
              type: 'provider.reconcileReply',
              payload: { organizationId, reviewId, replyId },
              dedupeKey: `provider:reply-reconcile:${replyId}:lease-recovery:${job.id}:${updated.retryCount}`,
              runAt: now,
              maxAttempts: 5,
            },
          });
        }

        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'SUCCEEDED',
            completedAt: now,
            lastError: `${WORKER_LEASE_EXPIRED_CODE}:RECONCILIATION_REQUIRED`,
          },
        });
        return 'reconciliation';
      }
    }
  }

  return 'requeued';
}

export async function recoverExpiredJobLeases(
  prisma: PrismaClient,
  input: { cutoff: Date; now?: Date; limit?: number },
): Promise<{ recovered: number; requeued: number; reconciled: number }> {
  const now = input.now ?? new Date();
  const candidates = await prisma.job.findMany({
    where: {
      status: 'RUNNING',
      lockedAt: { lt: input.cutoff },
    },
    orderBy: [{ lockedAt: 'asc' }, { createdAt: 'asc' }],
    take: input.limit ?? 100,
  });

  let recovered = 0;
  let requeued = 0;
  let reconciled = 0;

  for (const candidate of candidates) {
    const outcome = await prisma.$transaction(async (tx) => {
      const lease = await tx.job.updateMany({
        where: {
          id: candidate.id,
          status: 'RUNNING',
          lockedAt: candidate.lockedAt,
          lockToken: candidate.lockToken,
        },
        data: {
          status: 'QUEUED',
          lockedAt: null,
          lockToken: null,
          completedAt: null,
          runAt: now,
          lastError: WORKER_LEASE_EXPIRED_CODE,
        },
      });
      if (lease.count !== 1) return null;

      return recoverDomainState(tx, candidate as RecoverableJob, now);
    });

    if (!outcome) continue;
    recovered += 1;
    if (outcome === 'reconciliation') reconciled += 1;
    else requeued += 1;
  }

  return { recovered, requeued, reconciled };
}

export async function syncJobDomainTerminalFailure(
  prisma: PrismaClient,
  job: Pick<RecoverableJob, 'type' | 'payload'>,
  input: { errorCode: string; error: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const message = input.error.slice(0, 4000);
  const errorCode = input.errorCode.slice(0, 120);

  if (job.type === 'ai.analyzeReview' || job.type === 'ai.generateReply') {
    const aiOperationId = payloadString(job, 'aiOperationId');
    if (aiOperationId) {
      await prisma.aiOperation.updateMany({
        where: { id: aiOperationId, status: { in: ['QUEUED', 'RUNNING', 'FAILED'] } },
        data: {
          status: 'FAILED',
          completedAt: now,
          errorCode,
          errorMessage: message,
        },
      });
    }
    return;
  }

  if (job.type === 'aiVisibility.run') {
    const runId = payloadString(job, 'runId');
    if (runId) {
      await prisma.aiVisibilityRun.updateMany({
        where: { id: runId, status: { in: ['QUEUED', 'RUNNING', 'FAILED'] } },
        data: {
          status: 'FAILED',
          completedAt: now,
          errorCode,
          errorMessage: message,
        },
      });
    }
    return;
  }

  if (job.type === 'askShield.answer') {
    const queryId = payloadString(job, 'queryId');
    if (queryId) {
      await prisma.askShieldQuery.updateMany({
        where: { id: queryId, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          completedAt: now,
          errorCode,
          errorMessage: message,
        },
      });
    }
    return;
  }

  if (job.type === 'provider.publishReply') {
    const replyId = payloadString(job, 'replyId');
    if (replyId) {
      await prisma.reviewReply.updateMany({
        where: { id: replyId, status: 'PUBLISH_QUEUED' },
        data: { status: 'PUBLISH_FAILED', failedReason: message },
      });
    }
    return;
  }

  if (job.type === 'provider.reconcileReply') {
    const replyId = payloadString(job, 'replyId');
    if (replyId) {
      await prisma.reviewReply.updateMany({
        where: { id: replyId, status: 'PUBLISH_UNKNOWN' },
        data: {
          status: 'PUBLISH_FAILED',
          failedReason: message,
          lastReconciledAt: now,
        },
      });
    }
  }
}
