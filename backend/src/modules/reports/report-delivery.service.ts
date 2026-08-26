import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';
import type { ScheduledReportDelivery } from './report-scheduler.service.js';

export class ReportDeliveryError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'ReportDeliveryError';
    this.retryable = retryable;
  }
}

function reportText(report: {
  title: string;
  periodStart: Date;
  periodEnd: Date;
  data: unknown;
}): string {
  const data = report.data && typeof report.data === 'object' && !Array.isArray(report.data)
    ? report.data as Record<string, unknown>
    : {};
  return [
    `Бизнес Щит · ${report.title}`,
    `${report.periodStart.toLocaleDateString('ru-RU')} — ${report.periodEnd.toLocaleDateString('ru-RU')}`,
    '',
    `Отзывов: ${Number(data.reviewCount ?? 0)}`,
    `Средний рейтинг: ${data.averageRating ?? 'нет данных'}`,
    `Позитивные: ${Number(data.positiveShare ?? 0)}%`,
    `Негативные: ${Number(data.negativeShare ?? 0)}%`,
    `Покрытие ответами: ${Number(data.responseCoverage ?? 0)}%`,
  ].join('\n');
}

function safeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char] || char));
}

export function reportDeliveryIdempotencyKey(input: {
  organizationId: string;
  reportId: string;
  delivery: ScheduledReportDelivery;
}): string {
  const digest = createHash('sha256')
    .update([
      input.organizationId,
      input.reportId,
      input.delivery.scheduleId,
      input.delivery.slot,
      input.delivery.channel,
    ].join('\n'))
    .digest('hex');
  return `bs-report-${digest}`;
}

async function fallbackEmailDestination(
  prisma: PrismaClient,
  organizationId: string,
): Promise<string> {
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      status: 'ACTIVE',
      role: { in: ['OWNER', 'ADMIN'] },
      user: { status: 'ACTIVE', email: { not: null } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { user: { select: { email: true } } },
  });
  const value = String(member?.user.email || '').trim();
  if (!value) throw new ReportDeliveryError('REPORT_EMAIL_DESTINATION_REQUIRED');
  return value;
}

async function sendEmail(to: string, subject: string, text: string, eventId: string) {
  if (env.REPORT_EMAIL_PROVIDER === 'disabled') {
    throw new ReportDeliveryError('REPORT_EMAIL_PROVIDER_NOT_CONFIGURED');
  }
  if (env.REPORT_EMAIL_PROVIDER === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.REPORT_EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': eventId,
      },
      body: JSON.stringify({
        from: env.REPORT_EMAIL_FROM,
        to: [to],
        subject,
        text,
        html: `<pre style="font-family:Inter,Arial,sans-serif;white-space:pre-wrap">${safeHtml(text)}</pre>`,
      }),
    });
    if (!response.ok) {
      throw new ReportDeliveryError(`REPORT_EMAIL_RESEND_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
    }
    return;
  }

  const response = await fetch(env.REPORT_EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': eventId,
      'X-Business-Shield-Event-Id': eventId,
      ...(env.REPORT_EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.REPORT_EMAIL_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify({ eventId, to, subject, text }),
  });
  if (!response.ok) {
    throw new ReportDeliveryError(`REPORT_EMAIL_WEBHOOK_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
  }
}

async function sendTelegram(chatId: string, text: string) {
  if (!env.REPORT_TELEGRAM_BOT_TOKEN) {
    throw new ReportDeliveryError('REPORT_TELEGRAM_BOT_NOT_CONFIGURED');
  }
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(env.REPORT_TELEGRAM_BOT_TOKEN)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    throw new ReportDeliveryError(`REPORT_TELEGRAM_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
  }
}

export async function enqueueReportDelivery(
  prisma: PrismaClient,
  input: { organizationId: string; reportId: string; delivery: ScheduledReportDelivery },
) {
  const dedupeKey = `report-delivery:${input.delivery.scheduleId}:${input.delivery.slot}`;
  const lockKey = `report-delivery:${input.organizationId}:${input.delivery.scheduleId}:${input.delivery.slot}`;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ acquired: number }>>`
      SELECT 1::int AS acquired FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)) AS advisory_lock
    `;
    const exists = await tx.job.findFirst({
      where: { organizationId: input.organizationId, dedupeKey },
      select: { id: true },
    });
    if (exists) return exists;

    return tx.job.create({
      data: {
        organizationId: input.organizationId,
        type: 'report.deliver',
        payload: { reportId: input.reportId, delivery: input.delivery },
        dedupeKey,
        maxAttempts: 5,
      },
    });
  });
}

export async function processReportDeliveryJob(
  prisma: PrismaClient,
  input: { organizationId: string; reportId: string; delivery: ScheduledReportDelivery },
) {
  const report = await prisma.report.findFirst({
    where: { id: input.reportId, organizationId: input.organizationId },
  });
  if (!report) throw new ReportDeliveryError('REPORT_NOT_FOUND');
  if (report.status !== 'READY' || !report.generatedAt) {
    throw new ReportDeliveryError('REPORT_NOT_READY_FOR_DELIVERY', true);
  }

  const configuredDestination = String(input.delivery.destination || '').trim();
  let destination: string;
  if (input.delivery.channel === 'telegram') {
    if (!configuredDestination) throw new ReportDeliveryError('REPORT_TELEGRAM_DESTINATION_REQUIRED');
    destination = configuredDestination;
  } else {
    destination = configuredDestination || await fallbackEmailDestination(prisma, input.organizationId);
  }

  const eventId = reportDeliveryIdempotencyKey(input);
  const text = reportText(report);

  // Persist the attempt before the external side effect. If the post-send audit
  // fails, the already successful delivery must not be retried solely because
  // our audit storage was temporarily unavailable.
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      action: 'report.schedule.delivery_attempted',
      entityType: 'Report',
      entityId: report.id,
      metadata: {
        scheduleId: input.delivery.scheduleId,
        channel: input.delivery.channel,
        slot: input.delivery.slot,
        eventId,
        destinationConfigured: true,
      },
    },
  });

  if (input.delivery.channel === 'email') await sendEmail(destination, report.title, text, eventId);
  else await sendTelegram(destination, text);

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      action: 'report.schedule.delivered',
      entityType: 'Report',
      entityId: report.id,
      metadata: {
        scheduleId: input.delivery.scheduleId,
        channel: input.delivery.channel,
        slot: input.delivery.slot,
        eventId,
        destinationConfigured: true,
      },
    },
  }).catch(() => null);
}
