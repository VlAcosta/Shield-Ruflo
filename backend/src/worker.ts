import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { env } from './config/env.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const workerId = crypto.randomUUID();
let stopping = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processIntegrationSync(payload: any) {
  const syncRunId = String(payload?.syncRunId || '');
  const accountId = String(payload?.accountId || '');
  if (!syncRunId || !accountId) throw new Error('INVALID_INTEGRATION_SYNC_JOB');

  const run = await prisma.integrationSyncRun.findFirst({ where: { id: syncRunId, accountId } });
  if (!run) throw new Error('INTEGRATION_SYNC_RUN_NOT_FOUND');

  await prisma.integrationSyncRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: new Date(), errorCode: null, errorMessage: null },
  });

  const account = await prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId: run.organizationId } });
  if (!account || account.status !== 'CONNECTED') {
    await prisma.integrationSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorCount: 1,
        errorCode: 'INTEGRATION_NOT_CONNECTED',
        errorMessage: 'Интеграция не подключена к production provider adapter',
      },
    });
    throw new Error('INTEGRATION_NOT_CONNECTED');
  }

  // No provider is silently simulated. A future provider adapter owns the real
  // transport and must update this branch only after provider confirmation.
  await prisma.integrationSyncRun.update({
    where: { id: run.id },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      errorCount: 1,
      errorCode: 'PROVIDER_ADAPTER_NOT_CONFIGURED',
      errorMessage: 'Production provider adapter is not configured',
    },
  });
  throw new Error('PROVIDER_ADAPTER_NOT_CONFIGURED');
}

async function processReport(payload: any) {
  const reportId = String(payload?.reportId || '');
  if (!reportId) throw new Error('INVALID_REPORT_JOB');
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('REPORT_NOT_FOUND');

  await prisma.report.update({ where: { id: report.id }, data: { status: 'GENERATING', errorMessage: null } });
  const [aggregate, positive, negative, answered] = await Promise.all([
    prisma.review.aggregate({
      where: { organizationId: report.organizationId, receivedAt: { gte: report.periodStart, lte: report.periodEnd } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.review.count({ where: { organizationId: report.organizationId, receivedAt: { gte: report.periodStart, lte: report.periodEnd }, rating: { gte: 4 } } }),
    prisma.review.count({ where: { organizationId: report.organizationId, receivedAt: { gte: report.periodStart, lte: report.periodEnd }, rating: { lte: 2 } } }),
    prisma.review.count({
      where: {
        organizationId: report.organizationId,
        receivedAt: { gte: report.periodStart, lte: report.periodEnd },
        replies: { some: { status: 'PUBLISHED' } },
      },
    }),
  ]);
  const total = aggregate._count._all;
  const data = {
    measured: total > 0,
    reviewCount: total,
    averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
    positiveShare: total ? Number(((positive / total) * 100).toFixed(1)) : 0,
    negativeShare: total ? Number(((negative / total) * 100).toFixed(1)) : 0,
    responseCoverage: total ? Number(((answered / total) * 100).toFixed(1)) : 0,
  };
  await prisma.report.update({
    where: { id: report.id },
    data: { status: 'READY', data, generatedAt: new Date() },
  });
}

async function processJob(job: any) {
  if (job.type === 'integration.sync.reviews') return processIntegrationSync(job.payload);
  if (job.type === 'report.generate') return processReport(job.payload);
  throw new Error(`UNSUPPORTED_JOB_TYPE:${job.type}`);
}

async function claimNextJob() {
  const candidate = await prisma.job.findFirst({
    where: {
      status: 'QUEUED',
      runAt: { lte: new Date() },
      attempts: { lt: 10 },
    },
    orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
  });
  if (!candidate) return null;

  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, status: 'QUEUED', lockedAt: null },
    data: { status: 'RUNNING', lockedAt: new Date(), lockToken: workerId, attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  return prisma.job.findUnique({ where: { id: candidate.id } });
}

async function finishSuccess(id: string) {
  await prisma.job.update({
    where: { id },
    data: { status: 'SUCCEEDED', completedAt: new Date(), lockedAt: null, lockToken: null, lastError: null },
  });
}

async function finishFailure(job: any, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(3600, 5 * 2 ** Math.max(0, job.attempts - 1));
  await prisma.job.update({
    where: { id: job.id },
    data: exhausted
      ? { status: 'DEAD', lastError: message.slice(0, 4000), lockedAt: null, lockToken: null }
      : {
          status: 'QUEUED',
          lastError: message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
          runAt: new Date(Date.now() + delaySeconds * 1000),
        },
  });
}

async function main() {
  console.log(JSON.stringify({ level: 'info', message: 'Business Shield worker started', workerId }));
  while (!stopping) {
    const job = await claimNextJob();
    if (!job) {
      await sleep(1500);
      continue;
    }
    try {
      await processJob(job);
      await finishSuccess(job.id);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Job failed', jobId: job.id, type: job.type, error: error instanceof Error ? error.message : String(error) }));
      await finishFailure(job, error);
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
