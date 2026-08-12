import type { FastifyInstance } from 'fastify';
import type { CalendarEvent } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';

export type CalendarActor = {
  organizationId: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
};

export type CalendarEventInput = {
  title: string;
  date: string;
  time: string;
  type: 'work' | 'report' | 'meeting' | 'deadline' | 'sla';
  tone: 'violet' | 'cyan' | 'green' | 'orange' | 'red';
  note?: string | undefined;
};

export type CalendarEventUpdateInput = Partial<CalendarEventInput>;

function dateOnly(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppError({ code: 'CALENDAR_DATE_INVALID', message: 'Некорректная дата события', statusCode: 400 });
  }
  return parsed;
}

function serializeCalendarEvent(event: CalendarEvent) {
  return {
    id: event.id,
    title: event.title,
    date: event.eventDate.toISOString().slice(0, 10),
    time: event.eventTime,
    type: event.type,
    tone: event.tone,
    note: event.note ?? '',
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export async function listCalendarEvents(
  app: FastifyInstance,
  organizationId: string,
  range: { from?: string | undefined; to?: string | undefined },
) {
  const eventDate = range.from || range.to
    ? {
        ...(range.from ? { gte: dateOnly(range.from) } : {}),
        ...(range.to ? { lte: dateOnly(range.to) } : {}),
      }
    : undefined;

  const events = await app.prisma.calendarEvent.findMany({
    where: {
      organizationId,
      ...(eventDate ? { eventDate } : {}),
    },
    orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }, { createdAt: 'asc' }],
    take: 2_000,
  });

  return events.map(serializeCalendarEvent);
}

export async function createCalendarEvent(
  app: FastifyInstance,
  actor: CalendarActor,
  input: CalendarEventInput,
  idempotencyKey?: string,
) {
  if (idempotencyKey) {
    const existing = await app.prisma.calendarEvent.findFirst({
      where: { organizationId: actor.organizationId, idempotencyKey },
    });
    if (existing) return serializeCalendarEvent(existing);
  }

  const created = await app.prisma.$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        title: input.title,
        eventDate: dateOnly(input.date),
        eventTime: input.time,
        type: input.type,
        tone: input.tone,
        note: input.note?.trim() || null,
        idempotencyKey: idempotencyKey || null,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'calendar.event.created',
        entityType: 'calendar_event',
        entityId: event.id,
        metadata: { date: input.date, time: input.time, type: input.type },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });

    return event;
  });

  return serializeCalendarEvent(created);
}

export async function updateCalendarEvent(
  app: FastifyInstance,
  actor: CalendarActor,
  eventId: string,
  input: CalendarEventUpdateInput,
) {
  const existing = await app.prisma.calendarEvent.findFirst({
    where: { id: eventId, organizationId: actor.organizationId },
  });
  if (!existing) {
    throw new AppError({ code: 'CALENDAR_EVENT_NOT_FOUND', message: 'Событие не найдено', statusCode: 404 });
  }

  const updated = await app.prisma.$transaction(async (tx) => {
    const event = await tx.calendarEvent.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.date !== undefined ? { eventDate: dateOnly(input.date) } : {}),
        ...(input.time !== undefined ? { eventTime: input.time } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.tone !== undefined ? { tone: input.tone } : {}),
        ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'calendar.event.updated',
        entityType: 'calendar_event',
        entityId: event.id,
        metadata: { fields: Object.keys(input) },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });

    return event;
  });

  return serializeCalendarEvent(updated);
}

export async function deleteCalendarEvent(
  app: FastifyInstance,
  actor: CalendarActor,
  eventId: string,
) {
  const existing = await app.prisma.calendarEvent.findFirst({
    where: { id: eventId, organizationId: actor.organizationId },
    select: { id: true, title: true, eventDate: true },
  });
  if (!existing) {
    throw new AppError({ code: 'CALENDAR_EVENT_NOT_FOUND', message: 'Событие не найдено', statusCode: 404 });
  }

  await app.prisma.$transaction(async (tx) => {
    await tx.calendarEvent.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'calendar.event.deleted',
        entityType: 'calendar_event',
        entityId: existing.id,
        metadata: { title: existing.title, date: existing.eventDate.toISOString().slice(0, 10) },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });
  });
}
