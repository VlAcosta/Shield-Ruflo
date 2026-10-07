import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  completeJobLease,
  failJobLease,
  renewJobLease,
} from '../src/core/jobs/job-lease.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Worker lease integration tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('durable worker lease fencing', () => {
  let app: FastifyInstance;
  const createdJobIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    if (createdJobIds.length) {
      await app.prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
    }
    await app.close();
  });

  async function runningJob(workerId: string) {
    const job = await app.prisma.job.create({
      data: {
        type: 'test.worker.lease',
        payload: {},
        status: 'RUNNING',
        attempts: 1,
        maxAttempts: 5,
        lockedAt: new Date(Date.now() - 60_000),
        lockToken: workerId,
      },
    });
    createdJobIds.push(job.id);
    return job;
  }

  it('renews and completes only the worker that owns the lease', async () => {
    const job = await runningJob('worker-a');

    expect(await renewJobLease(app.prisma, { jobId: job.id, workerId: 'worker-b' })).toBe(false);
    expect(await renewJobLease(app.prisma, { jobId: job.id, workerId: 'worker-a' })).toBe(true);

    const renewed = await app.prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(renewed.lockedAt!.getTime()).toBeGreaterThan(job.lockedAt!.getTime());

    expect(await completeJobLease(app.prisma, { jobId: job.id, workerId: 'worker-b' })).toBe(false);
    expect((await app.prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('RUNNING');

    expect(await completeJobLease(app.prisma, { jobId: job.id, workerId: 'worker-a' })).toBe(true);
    const completed = await app.prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(completed.status).toBe('SUCCEEDED');
    expect(completed.lockToken).toBeNull();
    expect(completed.lockedAt).toBeNull();
  });

  it('prevents a stale worker from requeueing or killing a lease it no longer owns', async () => {
    const job = await runningJob('worker-new');

    const staleFailure = await failJobLease(app.prisma, {
      jobId: job.id,
      workerId: 'worker-old',
      exhausted: true,
      message: 'stale worker failure',
      nextRunAt: null,
    });
    expect(staleFailure).toBe(false);
    expect((await app.prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('RUNNING');

    const retryAt = new Date(Date.now() + 30_000);
    const ownerFailure = await failJobLease(app.prisma, {
      jobId: job.id,
      workerId: 'worker-new',
      exhausted: false,
      message: 'temporary provider outage',
      nextRunAt: retryAt,
    });
    expect(ownerFailure).toBe(true);

    const requeued = await app.prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(requeued.status).toBe('QUEUED');
    expect(requeued.lockToken).toBeNull();
    expect(requeued.lockedAt).toBeNull();
    expect(requeued.lastError).toBe('temporary provider outage');
    expect(requeued.runAt.getTime()).toBe(retryAt.getTime());
  });
});
