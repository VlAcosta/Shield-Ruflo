import type { FastifyInstance } from 'fastify';
import type { Prisma, TaskPriority, TaskStatus } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';

const statusToClient: Record<TaskStatus, string> = {
  NEW: 'new',
  IN_PROGRESS: 'progress',
  WAITING: 'waiting',
  DONE: 'done',
  ARCHIVED: 'archived',
};

const clientToStatus: Record<string, TaskStatus> = {
  new: 'NEW',
  NEW: 'NEW',
  progress: 'IN_PROGRESS',
  in_progress: 'IN_PROGRESS',
  IN_PROGRESS: 'IN_PROGRESS',
  waiting: 'WAITING',
  WAITING: 'WAITING',
  done: 'DONE',
  DONE: 'DONE',
  archived: 'ARCHIVED',
  ARCHIVED: 'ARCHIVED',
};

const clientToPriority: Record<string, TaskPriority> = {
  critical: 'CRITICAL',
  CRITICAL: 'CRITICAL',
  high: 'HIGH',
  HIGH: 'HIGH',
  medium: 'MEDIUM',
  MEDIUM: 'MEDIUM',
  low: 'LOW',
  LOW: 'LOW',
};

export type TaskMutationInput = {
  title?: string | undefined;
  description?: string | null | undefined;
  status?: string | undefined;
  priority?: string | undefined;
  deadline?: string | null | undefined;
  dueDate?: string | null | undefined;
  businessId?: string | null | undefined;
  locationId?: string | null | undefined;
  reviewId?: string | null | undefined;
  caseId?: string | null | undefined;
  assigneeMemberIds?: string[] | undefined;
  position?: number | undefined;
};

export type CreateTaskInput = TaskMutationInput & { title: string };
export type TaskPreferences = { view: 'board' | 'list' };

export function parseTaskStatus(value: string | undefined): TaskStatus | undefined {
  return value ? clientToStatus[value] : undefined;
}

export function parseTaskPriority(value: string | undefined): TaskPriority | undefined {
  return value ? clientToPriority[value] : undefined;
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function taskPreferencesKey(organizationId: string, userId: string) {
  return `task.preferences:${organizationId}:${userId}`;
}

function parseTaskPreferences(value: unknown): TaskPreferences {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const view = (value as Record<string, unknown>).view;
    if (view === 'list' || view === 'board') return { view };
  }
  return { view: 'board' };
}

export async function getTaskPreferences(app: FastifyInstance, organizationId: string, userId: string): Promise<TaskPreferences> {
  const row = await app.prisma.serviceMetadata.findUnique({
    where: { key: taskPreferencesKey(organizationId, userId) },
    select: { value: true },
  });
  return parseTaskPreferences(row?.value);
}

export async function saveTaskPreferences(
  app: FastifyInstance,
  organizationId: string,
  userId: string,
  preferences: TaskPreferences,
): Promise<TaskPreferences> {
  const value = toJson(preferences);
  await app.prisma.serviceMetadata.upsert({
    where: { key: taskPreferencesKey(organizationId, userId) },
    create: { key: taskPreferencesKey(organizationId, userId), value },
    update: { value },
  });
  return preferences;
}

async function assertScopedReferences(
  app: FastifyInstance,
  organizationId: string,
  input: {
    businessId?: string | null | undefined;
    locationId?: string | null | undefined;
    reviewId?: string | null | undefined;
    caseId?: string | null | undefined;
  },
) {
  if (input.businessId) {
    const business = await app.prisma.business.findFirst({ where: { id: input.businessId, organizationId }, select: { id: true } });
    if (!business) throw new AppError({ code: 'BUSINESS_NOT_FOUND', message: 'Компания не найдена', statusCode: 404 });
  }
  if (input.locationId) {
    const location = await app.prisma.location.findFirst({
      where: { id: input.locationId, business: { organizationId } },
      select: { id: true },
    });
    if (!location) throw new AppError({ code: 'LOCATION_NOT_FOUND', message: 'Локация не найдена', statusCode: 404 });
  }
  if (input.reviewId) {
    const review = await app.prisma.review.findFirst({ where: { id: input.reviewId, organizationId }, select: { id: true } });
    if (!review) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });
  }
  if (input.caseId) {
    const reputationCase = await app.prisma.reputationCase.findFirst({ where: { id: input.caseId, organizationId }, select: { id: true } });
    if (!reputationCase) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });
  }
}

async function assertScopedMembers(app: FastifyInstance, organizationId: string, memberIds: string[]) {
  if (!memberIds.length) return;
  const count = await app.prisma.organizationMember.count({
    where: { id: { in: memberIds }, organizationId, status: 'ACTIVE' },
  });
  if (count !== memberIds.length) {
    throw new AppError({ code: 'TEAM_MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
  }
}

function serializeTask(task: any) {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    status: statusToClient[task.status as TaskStatus] ?? String(task.status).toLowerCase(),
    priority: String(task.priority).toLowerCase(),
    dueDate: task.deadline?.toISOString?.() ?? null,
    createdAt: task.createdAt?.toISOString?.() ?? task.createdAt,
    updatedAt: task.updatedAt?.toISOString?.() ?? task.updatedAt,
    businessId: task.businessId,
    locationId: task.locationId,
    reviewId: task.reviewId,
    caseId: task.caseId,
    position: task.position,
    assignees: (task.assignees ?? []).map((item: any) => ({
      memberId: item.organizationMemberId,
      userId: item.member?.userId,
      name: item.member?.user
        ? [item.member.user.firstName, item.member.user.lastName].filter(Boolean).join(' ') || item.member.user.email || item.member.user.phone
        : undefined,
    })),
    comments: (task.comments ?? []).map((item: any) => ({
      id: item.id,
      text: item.text,
      createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
      author: item.author ? {
        id: item.author.id,
        name: [item.author.firstName, item.author.lastName].filter(Boolean).join(' ') || item.author.email || item.author.phone,
      } : null,
    })),
    checklist: (task.checklist ?? []).map((item: any) => ({
      id: item.id,
      text: item.text,
      done: item.completed,
      position: item.position,
    })),
    attachments: (task.attachments ?? []).map((item: any) => ({
      id: item.id,
      name: item.fileName,
      mimeType: item.mimeType,
      size: item.sizeBytes,
      storageKey: item.storageKey,
    })),
  };
}

const taskInclude = {
  assignees: {
    include: {
      member: {
        select: {
          userId: true,
          user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      },
    },
  },
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
  },
  checklist: { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] },
  attachments: { orderBy: { createdAt: 'asc' as const } },
};

export async function listTasks(app: FastifyInstance, organizationId: string, userId: string) {
  const [tasks, preferences] = await Promise.all([
    app.prisma.task.findMany({
      where: { organizationId, status: { not: 'ARCHIVED' } },
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
      include: taskInclude,
    }),
    getTaskPreferences(app, organizationId, userId),
  ]);
  return { version: 2, preferences, tasks: tasks.map(serializeTask) };
}

export async function createTask(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  input: CreateTaskInput,
) {
  await assertScopedReferences(app, context.organizationId, input);
  const memberIds = [...new Set(input.assigneeMemberIds ?? [])];
  await assertScopedMembers(app, context.organizationId, memberIds);

  const task = await app.prisma.$transaction(async (tx) => {
    const data: Prisma.TaskUncheckedCreateInput = {
      organizationId: context.organizationId,
      createdByUserId: context.userId,
      title: input.title,
      description: input.description ?? null,
      status: parseTaskStatus(input.status) ?? 'NEW',
      priority: parseTaskPriority(input.priority) ?? 'MEDIUM',
      deadline: input.deadline || input.dueDate ? new Date(input.deadline ?? input.dueDate!) : null,
      businessId: input.businessId ?? null,
      locationId: input.locationId ?? null,
      reviewId: input.reviewId ?? null,
      caseId: input.caseId ?? null,
    };

    const created = await tx.task.create({ data });
    if (memberIds.length) {
      await tx.taskAssignee.createMany({
        data: memberIds.map((organizationMemberId) => ({ taskId: created.id, organizationMemberId })),
        skipDuplicates: true,
      });
    }
    await tx.taskActivity.create({
      data: {
        organizationId: context.organizationId,
        taskId: created.id,
        actorUserId: context.userId,
        action: 'task.created',
        metadata: { reviewId: input.reviewId ?? null },
      },
    });
    return tx.task.findUniqueOrThrow({ where: { id: created.id }, include: taskInclude });
  });
  return serializeTask(task);
}

export async function updateTask(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  taskId: string,
  patch: TaskMutationInput,
) {
  const existing = await app.prisma.task.findFirst({ where: { id: taskId, organizationId: context.organizationId } });
  if (!existing) throw new AppError({ code: 'TASK_NOT_FOUND', message: 'Задача не найдена', statusCode: 404 });

  await assertScopedReferences(app, context.organizationId, {
    businessId: patch.businessId,
    locationId: patch.locationId,
    reviewId: patch.reviewId,
    caseId: patch.caseId,
  });
  const memberIds = patch.assigneeMemberIds === undefined ? undefined : [...new Set(patch.assigneeMemberIds)];
  if (memberIds) await assertScopedMembers(app, context.organizationId, memberIds);

  const status = typeof patch.status === 'string' ? parseTaskStatus(patch.status) : undefined;
  const priority = typeof patch.priority === 'string' ? parseTaskPriority(patch.priority) : undefined;
  const deadlineValue = patch.deadline ?? patch.dueDate;

  const activityMetadata: Record<string, unknown> = {};
  if (patch.title !== undefined) activityMetadata.title = patch.title;
  if (patch.status !== undefined) activityMetadata.status = patch.status;
  if (patch.priority !== undefined) activityMetadata.priority = patch.priority;
  if (patch.position !== undefined) activityMetadata.position = patch.position;
  if (patch.businessId !== undefined) activityMetadata.businessId = patch.businessId;
  if (patch.locationId !== undefined) activityMetadata.locationId = patch.locationId;
  if (patch.reviewId !== undefined) activityMetadata.reviewId = patch.reviewId;
  if (patch.caseId !== undefined) activityMetadata.caseId = patch.caseId;
  if (memberIds !== undefined) activityMetadata.assigneeMemberIds = memberIds;

  const updated = await app.prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: existing.id },
      data: {
        ...(typeof patch.title === 'string' ? { title: patch.title } : {}),
        ...(typeof patch.description === 'string' || patch.description === null ? { description: patch.description } : {}),
        ...(status ? { status, completedAt: status === 'DONE' ? new Date() : null } : {}),
        ...(priority ? { priority } : {}),
        ...(deadlineValue !== undefined ? { deadline: deadlineValue ? new Date(String(deadlineValue)) : null } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...(patch.businessId !== undefined ? { businessId: patch.businessId } : {}),
        ...(patch.locationId !== undefined ? { locationId: patch.locationId } : {}),
        ...(patch.reviewId !== undefined ? { reviewId: patch.reviewId } : {}),
        ...(patch.caseId !== undefined ? { caseId: patch.caseId } : {}),
      },
    });

    if (memberIds !== undefined) {
      await tx.taskAssignee.deleteMany({ where: { taskId: existing.id } });
      if (memberIds.length) {
        await tx.taskAssignee.createMany({
          data: memberIds.map((organizationMemberId) => ({ taskId: existing.id, organizationMemberId })),
          skipDuplicates: true,
        });
      }
    }

    await tx.taskActivity.create({
      data: {
        organizationId: context.organizationId,
        taskId,
        actorUserId: context.userId,
        action: 'task.updated',
        metadata: toJson(activityMetadata),
      },
    });
    return tx.task.findUniqueOrThrow({ where: { id: existing.id }, include: taskInclude });
  });
  return serializeTask(updated);
}

export async function addTaskComment(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  taskId: string,
  text: string,
) {
  const task = await app.prisma.task.findFirst({ where: { id: taskId, organizationId: context.organizationId }, select: { id: true } });
  if (!task) throw new AppError({ code: 'TASK_NOT_FOUND', message: 'Задача не найдена', statusCode: 404 });
  return app.prisma.taskComment.create({
    data: { organizationId: context.organizationId, taskId, authorUserId: context.userId, text },
    include: { author: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
  });
}

export async function addChecklistItem(app: FastifyInstance, organizationId: string, taskId: string, text: string) {
  const task = await app.prisma.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
  if (!task) throw new AppError({ code: 'TASK_NOT_FOUND', message: 'Задача не найдена', statusCode: 404 });
  const max = await app.prisma.taskChecklistItem.aggregate({ where: { taskId }, _max: { position: true } });
  return app.prisma.taskChecklistItem.create({ data: { taskId, text, position: (max._max.position ?? -1) + 1 } });
}

export async function updateChecklistItem(
  app: FastifyInstance,
  organizationId: string,
  taskId: string,
  itemId: string,
  completed: boolean,
) {
  const item = await app.prisma.taskChecklistItem.findFirst({
    where: { id: itemId, taskId, task: { organizationId } },
    select: { id: true },
  });
  if (!item) throw new AppError({ code: 'CHECKLIST_ITEM_NOT_FOUND', message: 'Пункт не найден', statusCode: 404 });
  return app.prisma.taskChecklistItem.update({ where: { id: item.id }, data: { completed } });
}
