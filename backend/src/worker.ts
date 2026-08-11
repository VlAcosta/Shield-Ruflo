import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { env } from './config/env.js';
import { processIntegrationReviewSync } from './modules/integrations/review-ingestion.service.js';
import { registerGoogleBusinessProfileProvider } from './modules/integrations/providers/google/index.js';
import { processReviewAnalysisJob } from './modules/ai/review-intelligence.service.js';
import { processAiReplyGenerationJob } from './modules/ai/reply-copilot.service.js';
import { registerAiProviders } from './modules/ai/providers/index.js';
import { processReplyPublishJob, processReplyReconciliationJob } from './modules/reviews/review-publishing.service.js';
import { replyGenerationModeSchema } from './modules/ai/reply-copilot.schemas.js';
import { processVisibilityRunJob } from './modules/ai-visibility/ai-visibility.service.js';

registerGoogleBusinessProfileProvider();
registerAiProviders();

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const workerId = crypto.randomUUID();
const JOB_LEASE_TIMEOUT_MS = 5 * 60_000;
const JOB_CANDIDATE_BATCH = 25;
let stopping = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processIntegrationSync(payload: any) {
  const syncRunId = String(payload?.syncRunId || '');
  const accountId = String(payload?.accountId || '');
  if (!syncRunId || !accountId) throw new Error('INVALID_INTEGRATION_SYNC_JOB');
  return processIntegrationReviewSync(prisma, { syncRunId, accountId });
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
    data: { status: 'READY', data, generatedAt: new Date(), errorMessage: null },
  });
}

async function processJob(job: any) {
  if (job.type === 'integration.sync.reviews') return processIntegrationSync(job.payload);
  if (job.type === 'ai.analyzeReview') {
    const organizationId = String(job.payload?.organizationId || '');
    const reviewId = String(job.payload?.reviewId || '');
    const aiOperationId = String(job.payload?.aiOperationId || '');
    if (!organizationId || !reviewId || !aiOperationId) throw new Error('INVALID_AI_REVIEW_JOB');
    return processReviewAnalysisJob(prisma, { organizationId, reviewId, aiOperationId });
  }
  if (job.type === 'ai.generateReply') {
    const organizationId = String(job.payload?.organizationId || '');
    const reviewId = String(job.payload?.reviewId || '');
    const aiOperationId = String(job.payload?.aiOperationId || '');
    const actorUserId = String(job.payload?.actorUserId || '');
    const mode = replyGenerationModeSchema.parse(job.payload?.mode);
    const instructions = String(job.payload?.instructions || '');
    if (!organizationId || !reviewId || !aiOperationId || !actorUserId) throw new Error('INVALID_AI_REPLY_JOB');
    return processAiReplyGenerationJob(prisma, { organizationId, reviewId, aiOperationId, actorUserId, mode, instructions });
  }
  if (job.type === 'aiVisibility.run') {
    const organizationId = String(job.payload?.organizationId || '');
    const runId = String(job.payload?.runId || '');
    if (!organizationId || !runId) throw new Error('INVALID_AI_VISIBILITY_JOB');
    return processVisibilityRunJob(prisma, { organizationId, runId });
  }
  if (job.type === 'provider.publishReply' || job.type === 'provider.reconcileReply') {
    const organizationId = String(job.payload?.organizationId || '');
    const reviewId = String(job.payload?.reviewId || '');
    const replyId = String(job.payload?.replyId || '');
    if (!organizationId || !reviewId || !replyId) throw new Error('INVALID_REPLY_PROVIDER_JOB');
    return job.type === 'provider.publishReply'
      ? processReplyPublishJob(prisma, { organizationId, reviewId, replyId })
      : processReplyReconciliationJob(prisma, { organizationId, reviewId, replyId });
  }
  if (job.type === 'report.generate') return processReport(job.payload);
  throw new Error(`UNSUPPORTED_JOB_TYPE:${job.type}`);
}

async function recoverExpiredLeases() {
  const cutoff = new Date(Date.now() - JOB_LEASE_TIMEOUT_MS);
  const result = await prisma.job.updateMany({
    where: {
      status: 'RUNNING',
      lockedAt: { lt: cutoff },
    },
    data: {
      status: 'QUEUED',
      lockedAt: null,
      lockToken: null,
      runAt: new Date(),
      lastError: 'WORKER_LEASE_EXPIRED',
    },
  });
  if (result.count > 0) {
    console.warn(JSON.stringify({ level: 'warn', message: 'Recovered expired job leases', count: result.count }));
  }
}

async function claimNextJob() {
  await recoverExpiredLeases();

  const candidates = await prisma.job.findMany({
    where: {
      status: 'QUEUED',
      runAt: { lte: new Date() },
    },
    orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
    take: JOB_CANDIDATE_BATCH,
  });

  for (const candidate of candidates) {
    if (candidate.attempts >= candidate.maxAttempts) {
      await prisma.job.updateMany({
        where: { id: candidate.id, status: 'QUEUED', attempts: candidate.attempts },
        data: {
          status: 'DEAD',
          completedAt: new Date(),
          lastError: candidate.lastError || 'MAX_ATTEMPTS_EXHAUSTED',
          lockedAt: null,
          lockToken: null,
        },
      });
      continue;
    }

    const claimed = await prisma.job.updateMany({
      where: { id: candidate.id, status: 'QUEUED', lockedAt: null, attempts: candidate.attempts },
      data: { status: 'RUNNING', lockedAt: new Date(), lockToken: workerId, attempts: { increment: 1 } },
    });
    if (claimed.count === 1) return prisma.job.findUnique({ where: { id: candidate.id } });
  }

  return null;
}

async function finishSuccess(id: string) {
  await prisma.job.update({
    where: { id },
    data: { status: 'SUCCEEDED', completedAt: new Date(), lockedAt: null, lockToken: null, lastError: null },
  });
}

async function finishFailure(job: any, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const explicitlyNonRetryable = Boolean(error && typeof error === 'object' && 'retryable' in error && (error as { retryable?: boolean }).retryable === false);
  const exhausted = explicitlyNonRetryable || job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(3600, 5 * 2 ** Math.max(0, job.attempts - 1));
  await prisma.job.update({
    where: { id: job.id },
    data: exhausted
      ? {
          status: 'DEAD',
          completedAt: new Date(),
          lastError: message.slice(0, 4000),
          lockedAt: null,
          lockToken: null,
        }
      : {
          status: 'QUEUED',
          completedAt: null,
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
