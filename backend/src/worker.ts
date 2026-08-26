import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { env } from './config/env.js';
import { AppError } from './core/errors/app-error.js';
import { processIntegrationReviewSync } from './modules/integrations/review-ingestion.service.js';
import { registerIntegrationProviders } from './modules/integrations/providers/index.js';
import { scheduleDueIntegrationSyncs } from './modules/integrations/integration-scheduler.service.js';
import { processReviewAnalysisJob } from './modules/ai/review-intelligence.service.js';
import { processAiReplyGenerationJob } from './modules/ai/reply-copilot.service.js';
import { registerAiProviders } from './modules/ai/providers/index.js';
import { processReplyPublishJob, processReplyReconciliationJob } from './modules/reviews/review-publishing.service.js';
import { replyGenerationModeSchema } from './modules/ai/reply-copilot.schemas.js';
import { processVisibilityRunJob } from './modules/ai-visibility/ai-visibility.service.js';
import { processListingSyncJob } from './modules/listings/listing-health.service.js';
import { processAskShieldJob } from './modules/ask-shield/ask-shield.service.js';
import {
  processWebhookDeliveryJob,
  syncWebhookDeliveryJobFailure,
} from './modules/webhooks/webhook-delivery.service.js';
import { scheduleDueReports, type ScheduledReportDelivery } from './modules/reports/report-scheduler.service.js';
import { enqueueReportDelivery, processReportDeliveryJob } from './modules/reports/report-delivery.service.js';
import { processSuggestionDeliveryJob } from './modules/feedback/feedback.service.js';

registerIntegrationProviders();
registerAiProviders();

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const workerId = crypto.randomUUID();
const JOB_LEASE_TIMEOUT_MS = 5 * 60_000;
const JOB_CANDIDATE_BATCH = 25;
let stopping = false;
let lastIntegrationSchedulerAt = 0;
let lastReportSchedulerAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function webhookDeliveryId(job: any): string | null {
  if (job?.type !== 'webhook.deliver') return null;
  const value = String(job?.payload?.deliveryId || '');
  return value || null;
}

function integrationSyncRunId(job: any): string | null {
  if (job?.type !== 'integration.sync.reviews') return null;
  const value = String(job?.payload?.syncRunId || '');
  return value || null;
}

function reportGenerationId(job: any): string | null {
  if (job?.type !== 'report.generate') return null;
  const value = String(job?.payload?.reportId || '');
  return value || null;
}

function jobErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return String((error as { code: string }).code).slice(0, 120);
  }
  return 'JOB_EXECUTION_FAILED';
}

async function syncIntegrationRunJobFailure(
  job: any,
  input: { exhausted: boolean; error: string; errorCode: string },
) {
  const syncRunId = integrationSyncRunId(job);
  if (!syncRunId) return;
  const message = input.error.slice(0, 4000);
  await prisma.integrationSyncRun.updateMany({
    where: { id: syncRunId },
    data: input.exhausted
      ? {
          status: 'FAILED',
          finishedAt: new Date(),
          errorCode: input.errorCode,
          errorMessage: message,
        }
      : {
          status: 'QUEUED',
          finishedAt: null,
          errorCode: input.errorCode,
          errorMessage: message,
        },
  });
}

async function syncReportGenerationJobFailure(
  job: any,
  input: { exhausted: boolean; error: string },
) {
  const reportId = reportGenerationId(job);
  if (!reportId) return;
  const message = input.error.slice(0, 4000);
  await prisma.report.updateMany({
    where: {
      id: reportId,
      status: { in: input.exhausted ? ['QUEUED', 'GENERATING'] : ['GENERATING'] },
    },
    data: input.exhausted
      ? { status: 'FAILED', errorMessage: message }
      : { status: 'QUEUED', errorMessage: message },
  });
}

async function syncFeedbackDeliveryJobFailure(job: any, input: { exhausted: boolean; error: string }) {
  if (job?.type !== 'feedback.suggestion.deliver' || !input.exhausted) return;
  const suggestionId = String(job.payload?.suggestionId || '');
  if (!suggestionId) return;
  await prisma.productSuggestion.updateMany({
    where: { id: suggestionId, deliveryStatus: { not: 'DELIVERED' } },
    data: { deliveryStatus: 'FAILED', lastError: input.error.slice(0, 4000) },
  });
}

async function processIntegrationSync(payload: any) {
  const syncRunId = String(payload?.syncRunId || '');
  const accountId = String(payload?.accountId || '');
  if (!syncRunId || !accountId) throw new Error('INVALID_INTEGRATION_SYNC_JOB');
  return processIntegrationReviewSync(prisma, { syncRunId, accountId });
}

function scheduledDelivery(value: unknown): ScheduledReportDelivery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const channel = source.channel;
  if (channel !== 'email' && channel !== 'telegram') return null;
  const scheduleId = String(source.scheduleId || '');
  const slot = String(source.slot || '');
  if (!scheduleId || !slot) return null;
  const destination = typeof source.destination === 'string' ? source.destination : undefined;
  return { scheduleId, channel, slot, ...(destination ? { destination } : {}) };
}

async function processReport(payload: any) {
  const reportId = String(payload?.reportId || '');
  if (!reportId) throw new Error('INVALID_REPORT_JOB');
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('REPORT_NOT_FOUND');

  const delivery = scheduledDelivery(payload?.delivery);
  if (report.status === 'READY' && report.generatedAt) {
    if (delivery) {
      await enqueueReportDelivery(prisma, {
        organizationId: report.organizationId,
        reportId: report.id,
        delivery,
      });
    }
    return;
  }

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

  if (delivery) {
    await enqueueReportDelivery(prisma, {
      organizationId: report.organizationId,
      reportId: report.id,
      delivery,
    });
  }
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
  if (job.type === 'listing.sync') {
    const organizationId = String(job.payload?.organizationId || '');
    const sourceId = String(job.payload?.sourceId || '');
    if (!organizationId || !sourceId) throw new Error('INVALID_LISTING_SYNC_JOB');
    return processListingSyncJob(prisma, { organizationId, sourceId });
  }
  if (job.type === 'askShield.answer') {
    const organizationId = String(job.payload?.organizationId || '');
    const queryId = String(job.payload?.queryId || '');
    if (!organizationId || !queryId) throw new Error('INVALID_ASK_SHIELD_JOB');
    return processAskShieldJob(prisma, { organizationId, queryId });
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
  if (job.type === 'webhook.deliver') {
    const deliveryId = webhookDeliveryId(job);
    if (!deliveryId) throw new Error('INVALID_WEBHOOK_DELIVERY_JOB');
    return processWebhookDeliveryJob(prisma, { deliveryId });
  }
  if (job.type === 'report.generate') return processReport(job.payload);
  if (job.type === 'report.deliver') {
    const reportId = String(job.payload?.reportId || '');
    const organizationId = String(job.organizationId || '');
    const delivery = scheduledDelivery(job.payload?.delivery);
    if (!reportId || !organizationId || !delivery) throw new Error('INVALID_REPORT_DELIVERY_JOB');
    return processReportDeliveryJob(prisma, { organizationId, reportId, delivery });
  }
  if (job.type === 'feedback.suggestion.deliver') {
    const suggestionId = String(job.payload?.suggestionId || '');
    if (!suggestionId) throw new Error('INVALID_SUGGESTION_DELIVERY_JOB');
    return processSuggestionDeliveryJob(prisma, { suggestionId });
  }
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
      const message = candidate.lastError || 'MAX_ATTEMPTS_EXHAUSTED';
      const dead = await prisma.job.updateMany({
        where: { id: candidate.id, status: 'QUEUED', attempts: candidate.attempts },
        data: {
          status: 'DEAD',
          completedAt: new Date(),
          lastError: message,
          lockedAt: null,
          lockToken: null,
        },
      });
      if (dead.count !== 1) continue;
      await syncIntegrationRunJobFailure(candidate, {
        exhausted: true,
        error: message,
        errorCode: 'JOB_MAX_ATTEMPTS_EXHAUSTED',
      });
      await syncReportGenerationJobFailure(candidate, { exhausted: true, error: message });
      await syncFeedbackDeliveryJobFailure(candidate, { exhausted: true, error: message });
      const deliveryId = webhookDeliveryId(candidate);
      if (deliveryId) {
        await syncWebhookDeliveryJobFailure(prisma, {
          deliveryId,
          retryable: true,
          exhausted: true,
          nextRunAt: null,
          error: message,
        });
      }
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
  const providerMarkedNonRetryable = Boolean(
    error
    && typeof error === 'object'
    && 'retryable' in error
    && (error as { retryable?: boolean }).retryable === false,
  );
  const integrationAppError = job.type === 'integration.sync.reviews' && error instanceof AppError;
  const explicitlyNonRetryable = providerMarkedNonRetryable || integrationAppError;
  const exhausted = explicitlyNonRetryable || job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(3600, 5 * 2 ** Math.max(0, job.attempts - 1));
  const nextRunAt = exhausted ? null : new Date(Date.now() + delaySeconds * 1000);
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
          runAt: nextRunAt!,
        },
  });

  await syncIntegrationRunJobFailure(job, {
    exhausted,
    error: message,
    errorCode: jobErrorCode(error),
  });
  await syncReportGenerationJobFailure(job, { exhausted, error: message });
  await syncFeedbackDeliveryJobFailure(job, { exhausted, error: message });

  const deliveryId = webhookDeliveryId(job);
  if (deliveryId) {
    await syncWebhookDeliveryJobFailure(prisma, {
      deliveryId,
      retryable: !explicitlyNonRetryable,
      exhausted,
      nextRunAt,
      error: message,
    });
  }
}

async function maybeRunSchedulers() {
  const now = Date.now();
  if (env.INTEGRATION_SYNC_SCHEDULER_ENABLED && now - lastIntegrationSchedulerAt >= env.INTEGRATION_SYNC_POLL_SECONDS * 1000) {
    lastIntegrationSchedulerAt = now;
    try {
      const result = await scheduleDueIntegrationSyncs(prisma, {
        now: new Date(now),
        defaultIntervalMinutes: env.INTEGRATION_SYNC_DEFAULT_INTERVAL_MINUTES,
      });
      if (result.scheduled) console.log(JSON.stringify({ level: 'info', message: 'Scheduled provider sync jobs', count: result.scheduled }));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Provider sync scheduler failed', error: error instanceof Error ? error.message : String(error) }));
    }
  }
  if (env.REPORT_SCHEDULER_ENABLED && now - lastReportSchedulerAt >= env.REPORT_SCHEDULER_POLL_SECONDS * 1000) {
    lastReportSchedulerAt = now;
    try {
      const result = await scheduleDueReports(prisma, { now: new Date(now) });
      if (result.scheduled) console.log(JSON.stringify({ level: 'info', message: 'Scheduled report jobs', count: result.scheduled }));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Report scheduler failed', error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

async function main() {
  console.log(JSON.stringify({ level: 'info', message: 'Business Shield worker started', workerId }));
  while (!stopping) {
    await maybeRunSchedulers();
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