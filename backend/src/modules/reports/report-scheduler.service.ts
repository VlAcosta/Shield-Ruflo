import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

const REPORT_SCHEDULE_KEY_PREFIX = 'reports:schedules:';
const DAY_MS = 86_400_000;
const DAY_MAP: Readonly<Record<string, string>> = Object.freeze({
  Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
});

export type ScheduledReportDelivery = {
  scheduleId: string;
  channel: 'email' | 'telegram';
  destination?: string;
  slot: string;
};

type StoredSchedule = {
  id: string;
  title: string;
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  time: string;
  channel: 'email' | 'telegram';
  enabled: boolean;
  destination?: string;
};

function readSchedules(value: Prisma.JsonValue | null | undefined): StoredSchedule[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredSchedule => Boolean(
    item && typeof item === 'object'
    && 'id' in item && typeof item.id === 'string'
    && 'title' in item && typeof item.title === 'string'
    && 'day' in item && typeof item.day === 'string'
    && 'time' in item && typeof item.time === 'string'
    && 'channel' in item && (item.channel === 'email' || item.channel === 'telegram')
    && 'enabled' in item && typeof item.enabled === 'boolean',
  ));
}

function localClock(now: Date, timezone: string): { day: string; date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    day: DAY_MAP[read('weekday')] || '',
    date: `${read('year')}-${read('month')}-${read('day')}`,
    time: `${read('hour')}:${read('minute')}`,
  };
}

function validSchedule(schedule: StoredSchedule): boolean {
  return /^[a-zA-Z0-9._:-]{1,120}$/.test(schedule.id)
    && /^(mon|tue|wed|thu|fri|sat|sun)$/.test(schedule.day)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time);
}

export async function scheduleDueReports(
  prisma: PrismaClient,
  input: { now?: Date },
): Promise<{ scheduled: number; skipped: number }> {
  const now = input.now ?? new Date();
  const metadataRows = await prisma.serviceMetadata.findMany({
    where: { key: { startsWith: REPORT_SCHEDULE_KEY_PREFIX } },
    take: 5_000,
  });
  let scheduled = 0;
  let skipped = 0;

  for (const metadata of metadataRows) {
    const organizationId = metadata.key.slice(REPORT_SCHEDULE_KEY_PREFIX.length);
    if (!organizationId) continue;
    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, status: 'ACTIVE' },
      select: { id: true, timezone: true },
    });
    if (!organization) continue;
    const local = localClock(now, organization.timezone);

    for (const schedule of readSchedules(metadata.value)) {
      if (!schedule.enabled || !validSchedule(schedule) || local.day !== schedule.day || local.time < schedule.time) {
        skipped += 1;
        continue;
      }
      const slot = `${local.date}T${schedule.time}`;
      const dedupeKey = `report-schedule:${schedule.id}:${slot}`;
      const exists = await prisma.job.findFirst({
        where: { organizationId, dedupeKey },
        select: { id: true },
      });
      if (exists) {
        skipped += 1;
        continue;
      }

      const result = await prisma.$transaction(async (tx) => {
        const lockKey = `report-schedule:${organizationId}:${schedule.id}`;
        await tx.$queryRaw<Array<{ acquired: number }>>`
          SELECT 1::int AS acquired FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)) AS advisory_lock
        `;
        const duplicate = await tx.job.findFirst({ where: { organizationId, dedupeKey }, select: { id: true } });
        if (duplicate) return false;

        const periodEnd = now;
        const periodStart = new Date(periodEnd.getTime() - 7 * DAY_MS);
        const report = await tx.report.create({
          data: {
            organizationId,
            type: 'scheduled_weekly_reputation',
            title: schedule.title.slice(0, 240),
            periodStart,
            periodEnd,
            status: 'QUEUED',
          },
        });
        const delivery: ScheduledReportDelivery = {
          scheduleId: schedule.id,
          channel: schedule.channel,
          ...(schedule.destination ? { destination: schedule.destination } : {}),
          slot,
        };
        await tx.job.create({
          data: {
            organizationId,
            type: 'report.generate',
            payload: { reportId: report.id, delivery },
            dedupeKey,
            maxAttempts: 3,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            action: 'report.schedule.queued',
            entityType: 'Report',
            entityId: report.id,
            metadata: { scheduleId: schedule.id, channel: schedule.channel, slot },
          },
        });
        return true;
      });
      if (result) scheduled += 1;
      else skipped += 1;
    }
  }
  return { scheduled, skipped };
}
