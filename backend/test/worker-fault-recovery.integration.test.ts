import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  WORKER_LEASE_EXPIRED_CODE,
  recoverExpiredJobLeases,
  syncJobDomainTerminalFailure,
} from '../src/core/jobs/job-recovery.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Worker fault recovery tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('worker domain fault recovery', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  let businessId = '';
  let sourceId = '';
  let reviewId = '';

  beforeAll(async () => {
    app = await buildApp();

    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Fault recovery org', slug: `fault-recovery-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: { id: userId, phone: `+74${String(Date.now()).slice(-8)}1`, displayName: 'Recovery Owner' },
    });
    const business = await app.prisma.business.create({
      data: { organizationId, name: 'Recovery Business', status: 'ACTIVE', isPrimary: true },
    });
    businessId = business.id;
    const source = await app.prisma.reviewSource.create({
      data: {
        organizationId,
        businessId,
        provider: 'recovery-test',
        name: 'Recovery Source',
      },
    });
    sourceId = source.id;
    const review = await app.prisma.review.create({
      data: {
        organizationId,
        businessId,
        sourceId,
        externalId: `recovery-${randomUUID()}`,
        rating: 5,
        text: 'Recovery test review',
        receivedAt: new Date(),
      },
    });
    reviewId = review.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('requeues expired jobs together with their transient domain state', async () => {
    const now = new Date();
    const expiredAt = new Date(now.getTime() - 10 * 60_000);
    const cutoff = new Date(now.getTime() - 5 * 60_000);

    const account = await app.prisma.integrationAccount.create({
      data: {
        organizationId,
        provider: `recovery-provider-${randomUUID()}`,
        name: 'Recovery integration',
        status: 'CONNECTED',
      },
    });
    const syncRun = await app.prisma.integrationSyncRun.create({
      data: {
        organizationId,
        accountId: account.id,
        status: 'RUNNING',
        startedAt: expiredAt,
      },
    });
    const report = await app.prisma.report.create({
      data: {
        organizationId,
        type: 'manual',
        title: 'Recovery report',
        status: 'GENERATING',
        periodStart: new Date(now.getTime() - 86_400_000),
        periodEnd: now,
      },
    });
    const operation = await app.prisma.aiOperation.create({
      data: {
        organizationId,
        reviewId,
        operationType: 'REVIEW_INTELLIGENCE',
        provider: 'recovery-ai',
        model: 'recovery-model',
        promptVersion: 'recovery-v1',
        inputHash: 'recovery-input',
        status: 'RUNNING',
        startedAt: expiredAt,
      },
    });
    const probe = await app.prisma.aiVisibilityProbe.create({
      data: {
        organizationId,
        name: 'Recovery visibility probe',
        query: 'Where is the recovery business?',
      },
    });
    const visibilityRun = await app.prisma.aiVisibilityRun.create({
      data: {
        organizationId,
        probeId: probe.id,
        status: 'RUNNING',
        startedAt: expiredAt,
      },
    });
    const askQuery = await app.prisma.askShieldQuery.create({
      data: {
        organizationId,
        createdByUserId: userId,
        question: 'Recovery question?',
        status: 'RUNNING',
      },
    });

    const jobs = await Promise.all([
      app.prisma.job.create({
        data: {
          organizationId,
          type: 'integration.sync.reviews',
          payload: { syncRunId: syncRun.id, accountId: account.id },
          status: 'RUNNING',
          attempts: 1,
          lockedAt: expiredAt,
          lockToken: 'lease-integration',
        },
      }),
      app.prisma.job.create({
        data: {
          organizationId,
          type: 'report.generate',
          payload: { reportId: report.id },
          status: 'RUNNING',
          attempts: 1,
          lockedAt: expiredAt,
          lockToken: 'lease-report',
        },
      }),
      app.prisma.job.create({
        data: {
          organizationId,
          type: 'ai.analyzeReview',
          payload: { organizationId, reviewId, aiOperationId: operation.id },
          status: 'RUNNING',
          attempts: 1,
          lockedAt: expiredAt,
          lockToken: 'lease-ai',
        },
      }),
      app.prisma.job.create({
        data: {
          organizationId,
          type: 'aiVisibility.run',
          payload: { organizationId, runId: visibilityRun.id },
          status: 'RUNNING',
          attempts: 1,
          lockedAt: expiredAt,
          lockToken: 'lease-visibility',
        },
      }),
      app.prisma.job.create({
        data: {
          organizationId,
          type: 'askShield.answer',
          payload: { organizationId, queryId: askQuery.id },
          status: 'RUNNING',
          attempts: 1,
          lockedAt: expiredAt,
          lockToken: 'lease-ask',
        },
      }),
    ]);

    const fresh = await app.prisma.job.create({
      data: {
        organizationId,
        type: 'test.fresh-lease',
        payload: {},
        status: 'RUNNING',
        attempts: 1,
        lockedAt: now,
        lockToken: 'lease-fresh',
      },
    });

    const result = await recoverExpiredJobLeases(app.prisma, { cutoff, now, limit: 20 });
    expect(result).toEqual({ recovered: 5, requeued: 5, reconciled: 0 });

    const recoveredJobs = await app.prisma.job.findMany({
      where: { id: { in: jobs.map((job) => job.id) } },
    });
    expect(recoveredJobs).toHaveLength(5);
    for (const job of recoveredJobs) {
      expect(job.status).toBe('QUEUED');
      expect(job.lockedAt).toBeNull();
      expect(job.lockToken).toBeNull();
      expect(job.lastError).toBe(WORKER_LEASE_EXPIRED_CODE);
      expect(job.runAt.getTime()).toBe(now.getTime());
    }

    const freshStored = await app.prisma.job.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(freshStored.status).toBe('RUNNING');
    expect(freshStored.lockToken).toBe('lease-fresh');

    const storedSyncRun = await app.prisma.integrationSyncRun.findUniqueOrThrow({ where: { id: syncRun.id } });
    expect(storedSyncRun.status).toBe('QUEUED');
    expect(storedSyncRun.errorCode).toBe(WORKER_LEASE_EXPIRED_CODE);

    const storedReport = await app.prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(storedReport.status).toBe('QUEUED');
    expect(storedReport.errorMessage).toBe(WORKER_LEASE_EXPIRED_CODE);

    const storedOperation = await app.prisma.aiOperation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(storedOperation.status).toBe('QUEUED');
    expect(storedOperation.startedAt).toBeNull();
    expect(storedOperation.errorCode).toBe(WORKER_LEASE_EXPIRED_CODE);

    const storedVisibility = await app.prisma.aiVisibilityRun.findUniqueOrThrow({ where: { id: visibilityRun.id } });
    expect(storedVisibility.status).toBe('QUEUED');
    expect(storedVisibility.startedAt).toBeNull();
    expect(storedVisibility.errorCode).toBe(WORKER_LEASE_EXPIRED_CODE);

    const storedAsk = await app.prisma.askShieldQuery.findUniqueOrThrow({ where: { id: askQuery.id } });
    expect(storedAsk.status).toBe('RUNNING');
    expect(storedAsk.errorCode).toBe(WORKER_LEASE_EXPIRED_CODE);
  });

  it('hands an uncertain provider publication to reconciliation instead of publishing twice', async () => {
    const now = new Date();
    const expiredAt = new Date(now.getTime() - 10 * 60_000);
    const reply = await app.prisma.reviewReply.create({
      data: {
        organizationId,
        reviewId,
        authorUserId: userId,
        text: 'Provider publication recovery reply',
        status: 'PUBLISHING',
        version: 1,
        publishRequestedAt: expiredAt,
      },
    });
    const publishJob = await app.prisma.job.create({
      data: {
        organizationId,
        type: 'provider.publishReply',
        payload: { organizationId, reviewId, replyId: reply.id },
        status: 'RUNNING',
        attempts: 1,
        maxAttempts: 5,
        lockedAt: expiredAt,
        lockToken: 'lease-publish',
      },
    });

    const result = await recoverExpiredJobLeases(app.prisma, {
      cutoff: new Date(now.getTime() - 5 * 60_000),
      now,
      limit: 20,
    });
    expect(result).toEqual({ recovered: 1, requeued: 0, reconciled: 1 });

    const storedPublishJob = await app.prisma.job.findUniqueOrThrow({ where: { id: publishJob.id } });
    expect(storedPublishJob.status).toBe('SUCCEEDED');
    expect(storedPublishJob.completedAt).not.toBeNull();
    expect(storedPublishJob.lastError).toContain('RECONCILIATION_REQUIRED');

    const storedReply = await app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(storedReply.status).toBe('PUBLISH_UNKNOWN');
    expect(storedReply.failedReason).toBe(WORKER_LEASE_EXPIRED_CODE);
    expect(storedReply.retryCount).toBe(1);

    const reconciliationJobs = await app.prisma.job.findMany({
      where: {
        organizationId,
        type: 'provider.reconcileReply',
        payload: { path: ['replyId'], equals: reply.id },
      },
    });
    expect(reconciliationJobs).toHaveLength(1);
    expect(reconciliationJobs[0]?.status).toBe('QUEUED');

    const secondPass = await recoverExpiredJobLeases(app.prisma, {
      cutoff: new Date(now.getTime() - 5 * 60_000),
      now,
      limit: 20,
    });
    expect(secondPass).toEqual({ recovered: 0, requeued: 0, reconciled: 0 });
    expect(await app.prisma.job.count({
      where: {
        organizationId,
        type: 'provider.reconcileReply',
        payload: { path: ['replyId'], equals: reply.id },
      },
    })).toBe(1);
  });

  it('marks recovered domain work terminal when durable retries are exhausted', async () => {
    const now = new Date();
    const operation = await app.prisma.aiOperation.create({
      data: {
        organizationId,
        reviewId,
        operationType: 'REVIEW_REPLY_GENERATION',
        provider: 'recovery-ai',
        model: 'recovery-model',
        promptVersion: 'recovery-v1',
        inputHash: `terminal-${randomUUID()}`,
        status: 'QUEUED',
      },
    });
    const probe = await app.prisma.aiVisibilityProbe.create({
      data: {
        organizationId,
        name: `Terminal probe ${randomUUID()}`,
        query: 'Terminal visibility query',
      },
    });
    const visibilityRun = await app.prisma.aiVisibilityRun.create({
      data: { organizationId, probeId: probe.id, status: 'QUEUED' },
    });
    const askQuery = await app.prisma.askShieldQuery.create({
      data: {
        organizationId,
        question: 'Terminal recovery question?',
        status: 'RUNNING',
      },
    });
    const reply = await app.prisma.reviewReply.create({
      data: {
        organizationId,
        reviewId,
        text: 'Unknown provider result',
        status: 'PUBLISH_UNKNOWN',
        version: 2,
      },
    });

    await syncJobDomainTerminalFailure(
      app.prisma,
      { type: 'ai.generateReply', payload: { aiOperationId: operation.id } },
      { errorCode: 'JOB_MAX_ATTEMPTS_EXHAUSTED', error: 'AI retries exhausted', now },
    );
    await syncJobDomainTerminalFailure(
      app.prisma,
      { type: 'aiVisibility.run', payload: { runId: visibilityRun.id } },
      { errorCode: 'JOB_MAX_ATTEMPTS_EXHAUSTED', error: 'Visibility retries exhausted', now },
    );
    await syncJobDomainTerminalFailure(
      app.prisma,
      { type: 'askShield.answer', payload: { queryId: askQuery.id } },
      { errorCode: 'JOB_MAX_ATTEMPTS_EXHAUSTED', error: 'Ask retries exhausted', now },
    );
    await syncJobDomainTerminalFailure(
      app.prisma,
      { type: 'provider.reconcileReply', payload: { replyId: reply.id } },
      { errorCode: 'JOB_MAX_ATTEMPTS_EXHAUSTED', error: 'Reconciliation retries exhausted', now },
    );

    const [storedOperation, storedVisibility, storedAsk, storedReply] = await Promise.all([
      app.prisma.aiOperation.findUniqueOrThrow({ where: { id: operation.id } }),
      app.prisma.aiVisibilityRun.findUniqueOrThrow({ where: { id: visibilityRun.id } }),
      app.prisma.askShieldQuery.findUniqueOrThrow({ where: { id: askQuery.id } }),
      app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } }),
    ]);

    expect(storedOperation.status).toBe('FAILED');
    expect(storedOperation.errorCode).toBe('JOB_MAX_ATTEMPTS_EXHAUSTED');
    expect(storedVisibility.status).toBe('FAILED');
    expect(storedVisibility.errorCode).toBe('JOB_MAX_ATTEMPTS_EXHAUSTED');
    expect(storedAsk.status).toBe('FAILED');
    expect(storedAsk.errorCode).toBe('JOB_MAX_ATTEMPTS_EXHAUSTED');
    expect(storedReply.status).toBe('PUBLISH_FAILED');
    expect(storedReply.failedReason).toBe('Reconciliation retries exhausted');
    expect(storedReply.lastReconciledAt?.getTime()).toBe(now.getTime());
  });
});
