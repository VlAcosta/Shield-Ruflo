import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  finishJobLeaseFailure,
  finishJobLeaseSuccess,
  renewJobLease,
} from '../src/core/jobs/job-lease.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Worker lease fencing tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('worker job lease fencing', () => {
  let app: FastifyInstance;
  const jobIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    if (jobIds.length) {
      await app.prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    }
    await app.close();
  });

  it('prevents a stale worker from marking a job successful after ownership changes', async () => {
    const jobId = randomUUID();
    jobIds.push(jobId);

    await app.prisma.job.create({
      data: {
        id: jobId,
        type: 'test.lease.success',
        payload: {},
        status: 'RUNNING',
        attempts: 1,
        maxAttempts: 5,
        lockedAt: new Date(Date.now() - 5_000),
        lockToken: 'lease-a',
      },
    });

    const renewed = await renewJobLease(app.prisma, {
      jobId,
      lockToken: 'lease-a',
      now: new Date(),
    });
    expect(renewed).toBe(true);

    await app.prisma.job.update({
      where: { id: jobId },
      data: { lockToken: 'lease-b', lockedAt: new Date() },
    });

    const staleFinalization = await finishJobLeaseSuccess(app.prisma, {
      jobId,
      lockToken: 'lease-a',
    });
    expect(staleFinalization).toBe(false);

    const stillOwnedByReplacement = await app.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(stillOwnedByReplacement.status).toBe('RUNNING');
    expect(stillOwnedByReplacement.lockToken).toBe('lease-b');
    expect(stillOwnedByReplacement.completedAt).toBeNull();

    const currentFinalization = await finishJobLeaseSuccess(app.prisma, {
      jobId,
      lockToken: 'lease-b',
    });
    expect(currentFinalization).toBe(true);

    const completed = await app.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(completed.status).toBe('SUCCEEDED');
    expect(completed.lockToken).toBeNull();
    expect(completed.lockedAt).toBeNull();
    expect(completed.completedAt).not.toBeNull();
  });

  it('prevents a stale failure from overwriting the replacement lease state', async () => {
    const jobId = randomUUID();
    jobIds.push(jobId);

    await app.prisma.job.create({
      data: {
        id: jobId,
        type: 'test.lease.failure',
        payload: {},
        status: 'RUNNING',
        attempts: 2,
        maxAttempts: 5,
        lockedAt: new Date(),
        lockToken: 'lease-current',
      },
    });

    const nextRunAt = new Date(Date.now() + 60_000);
    const staleFinalization = await finishJobLeaseFailure(app.prisma, {
      jobId,
      lockToken: 'lease-stale',
      exhausted: true,
      error: 'STALE_WORKER_FAILURE',
      nextRunAt: null,
    });
    expect(staleFinalization).toBe(false);

    const unchanged = await app.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(unchanged.status).toBe('RUNNING');
    expect(unchanged.lockToken).toBe('lease-current');
    expect(unchanged.lastError).toBeNull();

    const currentFinalization = await finishJobLeaseFailure(app.prisma, {
      jobId,
      lockToken: 'lease-current',
      exhausted: false,
      error: 'RETRYABLE_PROVIDER_FAILURE',
      nextRunAt,
    });
    expect(currentFinalization).toBe(true);

    const requeued = await app.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(requeued.status).toBe('QUEUED');
    expect(requeued.lockToken).toBeNull();
    expect(requeued.lockedAt).toBeNull();
    expect(requeued.lastError).toBe('RETRYABLE_PROVIDER_FAILURE');
    expect(requeued.runAt.getTime()).toBe(nextRunAt.getTime());
  });
});
