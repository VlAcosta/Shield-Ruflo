import type { FastifyInstance } from 'fastify';
import type {
  SupportChannel,
  SupportMessage,
  SupportMessageRole,
  SupportPriority,
  SupportTicket,
  SupportTicketStatus,
} from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';

type SupportActor = {
  organizationId: string;
  userId: string;
};

type ClientMessageInput = {
  text: string;
  attachments?: unknown[];
  idempotencyKey?: string | null;
};

type AdminTicketPatch = {
  status?: 'open' | 'in_progress' | 'waiting' | 'closed';
  priority?: 'low' | 'medium' | 'high';
  unread?: number;
  assignedManagerId?: string | null;
};

const CHANNEL_META = Object.freeze({
  MANAGER: {
    id: 'manager',
    title: 'Персональный менеджер',
    shortTitle: 'Менеджер',
    name: 'Команда Бизнес Щит',
    initials: 'БЩ',
    role: 'Персональный менеджер',
    status: 'Доступен',
    statusTone: 'online',
    responseTime: 'ответим в рабочее время',
    description: 'Стратегия репутации, отчёты, тариф и работа команды.',
    pinned: 'Задайте вопрос по стратегии, тарифу, отчётам или организации работы. Ответ менеджера появится в этом диалоге.',
    tone: 'violet',
    category: 'Менеджер',
    subject: 'Обращение к персональному менеджеру',
    slaMinutes: 60,
  },
  TECHNICAL: {
    id: 'technical',
    title: 'Техническая поддержка',
    shortTitle: 'Техподдержка',
    name: 'Команда поддержки',
    initials: 'ТП',
    role: 'Технические специалисты',
    status: 'Доступна',
    statusTone: 'online',
    responseTime: 'ответим как можно скорее',
    description: 'Ошибки, доступ, интеграции, загрузка данных и работа кабинета.',
    pinned: 'Опишите проблему и шаги перед её появлением. Не отправляйте пароли, PIN-коды и секретные ключи.',
    tone: 'cyan',
    category: 'Техническая поддержка',
    subject: 'Обращение в техническую поддержку',
    slaMinutes: 30,
  },
} as const);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function channelFromClient(value: string): SupportChannel {
  if (value === 'manager') return 'MANAGER';
  if (value === 'technical') return 'TECHNICAL';
  throw new AppError({ code: 'SUPPORT_CHANNEL_NOT_FOUND', message: 'Канал поддержки не найден', statusCode: 404 });
}

function channelToClient(channel: SupportChannel) {
  return CHANNEL_META[channel];
}

function statusToClient(status: SupportTicketStatus): 'open' | 'in_progress' | 'waiting' | 'closed' {
  return status.toLowerCase() as 'open' | 'in_progress' | 'waiting' | 'closed';
}

function priorityToClient(priority: SupportPriority): 'low' | 'medium' | 'high' {
  return priority.toLowerCase() as 'low' | 'medium' | 'high';
}

function statusFromClient(status: AdminTicketPatch['status']): SupportTicketStatus | undefined {
  if (!status) return undefined;
  return status.toUpperCase() as SupportTicketStatus;
}

function priorityFromClient(priority: AdminTicketPatch['priority']): SupportPriority | undefined {
  if (!priority) return undefined;
  return priority.toUpperCase() as SupportPriority;
}

function personName(user: { displayName?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined, fallback: string) {
  const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return user?.displayName?.trim() || full || user?.email?.trim() || fallback;
}

function initials(value: string) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'БЩ';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function formatDateTime(value: Date, timeZone = 'Europe/Moscow') {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value).replace(',', '');
}

function formatTime(value: Date, timeZone = 'Europe/Moscow') {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function clientMessage(
  message: SupportMessage & {
    author?: { displayName: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
  },
  timeZone: string,
) {
  return {
    id: message.id,
    from: message.role === 'CLIENT' ? 'client' : 'support',
    author: message.role === 'CLIENT'
      ? personName(message.author, 'Пользователь')
      : personName(message.author, 'Бизнес Щит'),
    text: message.text,
    time: formatTime(message.createdAt, timeZone),
    createdAt: message.createdAt.getTime(),
    createdAtIso: message.createdAt.toISOString(),
    delivered: true,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
  };
}

async function getOrganizationTimezone(app: FastifyInstance, organizationId: string) {
  const organization = await app.prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return organization?.timezone || 'Europe/Moscow';
}

async function loadClientTickets(app: FastifyInstance, actor: SupportActor) {
  return app.prisma.supportTicket.findMany({
    where: {
      organizationId: actor.organizationId,
      createdByUserId: actor.userId,
    },
    include: {
      messages: {
        where: { internal: false },
        include: {
          author: { select: { displayName: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      },
    },
  });
}

export async function getSupportSnapshot(app: FastifyInstance, actor: SupportActor) {
  const [user, tickets, timeZone] = await Promise.all([
    app.prisma.user.findUnique({ where: { id: actor.userId }, select: { supportPreferences: true } }),
    loadClientTickets(app, actor),
    getOrganizationTimezone(app, actor.organizationId),
  ]);

  const preferences = asRecord(user?.supportPreferences);
  const activeChannel = preferences.activeChannel === 'technical' ? 'technical' : 'manager';

  const byChannel = new Map(tickets.map((ticket) => [ticket.channel, ticket]));
  return {
    version: 1,
    source: 'api',
    activeChannel,
    channels: [CHANNEL_META.MANAGER, CHANNEL_META.TECHNICAL].map(({ category: _category, subject: _subject, slaMinutes: _sla, ...meta }) => meta),
    threads: {
      manager: (byChannel.get('MANAGER')?.messages || []).map((message) => clientMessage(message, timeZone)),
      technical: (byChannel.get('TECHNICAL')?.messages || []).map((message) => clientMessage(message, timeZone)),
    },
  };
}

export async function saveSupportPreference(app: FastifyInstance, actor: SupportActor, activeChannel: 'manager' | 'technical') {
  const user = await app.prisma.user.findUnique({
    where: { id: actor.userId },
    select: { supportPreferences: true },
  });
  const current = asRecord(user?.supportPreferences);
  await app.prisma.user.update({
    where: { id: actor.userId },
    data: { supportPreferences: { ...current, activeChannel } },
  });
  return getSupportSnapshot(app, actor);
}

export async function addClientSupportMessage(
  app: FastifyInstance,
  actor: SupportActor,
  channelId: string,
  input: ClientMessageInput,
) {
  if (input.attachments?.length) {
    throw new AppError({
      code: 'SUPPORT_ATTACHMENTS_NOT_CONFIGURED',
      message: 'Загрузка вложений в поддержку пока не подключена',
      statusCode: 501,
    });
  }

  const channel = channelFromClient(channelId);
  const meta = channelToClient(channel);
  const now = new Date();

  let ticket = await app.prisma.supportTicket.findUnique({
    where: {
      organizationId_createdByUserId_channel: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        channel,
      },
    },
  });

  if (!ticket) {
    ticket = await app.prisma.supportTicket.create({
      data: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        channel,
        subject: meta.subject,
        category: meta.category,
        priority: channel === 'TECHNICAL' ? 'MEDIUM' : 'LOW',
      },
    });
    await app.prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'support.ticket.created',
        entityType: 'SupportTicket',
        entityId: ticket.id,
        metadata: { channel: meta.id },
      },
    });
  }

  if (input.idempotencyKey) {
    const existing = await app.prisma.supportMessage.findFirst({
      where: { ticketId: ticket.id, idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return {
        message: existing,
        ticket,
        snapshot: await getSupportSnapshot(app, actor),
      };
    }
  }

  const result = await app.prisma.$transaction(async (tx) => {
    const message = await tx.supportMessage.create({
      data: {
        organizationId: actor.organizationId,
        ticketId: ticket!.id,
        authorUserId: actor.userId,
        role: 'CLIENT',
        text: input.text,
        attachments: [],
        idempotencyKey: input.idempotencyKey || null,
      },
    });
    const updatedTicket = await tx.supportTicket.update({
      where: { id: ticket!.id },
      data: {
        status: ticket!.status === 'CLOSED' ? 'OPEN' : ticket!.status,
        closedAt: ticket!.status === 'CLOSED' ? null : ticket!.closedAt,
        adminUnreadCount: { increment: 1 },
        lastClientMessageAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'support.message.client',
        entityType: 'SupportTicket',
        entityId: ticket!.id,
        metadata: { messageId: message.id, channel: meta.id },
      },
    });
    return { message, ticket: updatedTicket };
  });

  return {
    ...result,
    snapshot: await getSupportSnapshot(app, actor),
  };
}

type TicketWithRelations = SupportTicket & {
  organization: { id: string; name: string; legalName: string | null; timezone: string };
  createdBy: { id: string; displayName: string | null; firstName: string | null; lastName: string | null; email: string | null };
  assignedTo: { id: string; displayName: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
  messages: Array<SupportMessage & {
    author: { displayName: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
  }>;
};

function elapsedMinutes(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

function adminMessage(message: TicketWithRelations['messages'][number], timeZone: string) {
  const role = message.role === 'CLIENT' ? 'client' : message.internal ? 'admin' : 'agent';
  return {
    id: message.id,
    author: message.role === 'CLIENT'
      ? personName(message.author, 'Клиент')
      : personName(message.author, 'Admin'),
    role,
    text: message.text,
    createdAt: formatDateTime(message.createdAt, timeZone),
    internal: message.internal,
  };
}

function derivedActivity(ticket: TicketWithRelations) {
  const items = [{
    id: `${ticket.id}:created`,
    label: 'Тикет создан',
    at: formatDateTime(ticket.createdAt, ticket.organization.timezone),
  }];
  if (ticket.firstResponseAt) {
    items.push({
      id: `${ticket.id}:first-response`,
      label: 'Первый ответ отправлен',
      at: formatDateTime(ticket.firstResponseAt, ticket.organization.timezone),
    });
  }
  if (ticket.closedAt) {
    items.push({
      id: `${ticket.id}:closed`,
      label: 'Тикет закрыт',
      at: formatDateTime(ticket.closedAt, ticket.organization.timezone),
    });
  }
  return items;
}

function adminTicket(ticket: TicketWithRelations) {
  const clientName = ticket.organization.legalName || ticket.organization.name;
  const responseReference = ticket.firstResponseAt || new Date();
  const meta = channelToClient(ticket.channel);
  return {
    id: ticket.id,
    subject: ticket.subject,
    clientId: ticket.organizationId,
    clientName,
    clientInitials: initials(clientName),
    status: statusToClient(ticket.status),
    priority: priorityToClient(ticket.priority),
    category: ticket.category,
    channel: meta.title,
    assignedManagerId: ticket.assignedToUserId || '',
    assignedManagerName: ticket.assignedTo ? personName(ticket.assignedTo, '') : '',
    createdAt: formatDateTime(ticket.createdAt, ticket.organization.timezone),
    updatedAt: formatDateTime(ticket.updatedAt, ticket.organization.timezone),
    firstResponseMinutes: elapsedMinutes(ticket.createdAt, responseReference),
    slaMinutes: meta.slaMinutes,
    unread: ticket.adminUnreadCount,
    messages: ticket.messages.map((message) => adminMessage(message, ticket.organization.timezone)),
    activity: derivedActivity(ticket),
  };
}

const ticketInclude = {
  organization: { select: { id: true, name: true, legalName: true, timezone: true } },
  createdBy: { select: { id: true, displayName: true, firstName: true, lastName: true, email: true } },
  assignedTo: { select: { id: true, displayName: true, firstName: true, lastName: true, email: true } },
  messages: {
    include: {
      author: { select: { displayName: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
    take: 500,
  },
} as const;

export async function listAdminSupportTickets(app: FastifyInstance) {
  const tickets = await app.prisma.supportTicket.findMany({
    include: ticketInclude,
    orderBy: [{ updatedAt: 'desc' }],
    take: 500,
  });
  return tickets.map((ticket) => adminTicket(ticket as TicketWithRelations));
}

async function getAdminTicketOrThrow(app: FastifyInstance, ticketId: string) {
  const ticket = await app.prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketInclude,
  });
  if (!ticket) {
    throw new AppError({ code: 'SUPPORT_TICKET_NOT_FOUND', message: 'Тикет поддержки не найден', statusCode: 404 });
  }
  return ticket as TicketWithRelations;
}

export async function updateAdminSupportTicket(
  app: FastifyInstance,
  actorUserId: string,
  ticketId: string,
  patch: AdminTicketPatch,
) {
  const current = await getAdminTicketOrThrow(app, ticketId);
  const status = statusFromClient(patch.status);
  const priority = priorityFromClient(patch.priority);
  const now = new Date();

  await app.prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: current.id },
      data: {
        ...(status ? { status, closedAt: status === 'CLOSED' ? now : null } : {}),
        ...(priority ? { priority } : {}),
        ...(patch.unread !== undefined ? { adminUnreadCount: Math.max(0, Math.floor(patch.unread)) } : {}),
        ...(patch.assignedManagerId !== undefined ? { assignedToUserId: patch.assignedManagerId || null } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: current.organizationId,
        actorUserId,
        action: 'support.ticket.updated',
        entityType: 'SupportTicket',
        entityId: current.id,
        metadata: {
          status: patch.status,
          priority: patch.priority,
          assignedManagerId: patch.assignedManagerId,
        },
      },
    });
  });

  return adminTicket(await getAdminTicketOrThrow(app, ticketId));
}

export async function addAdminSupportMessage(
  app: FastifyInstance,
  actorUserId: string,
  ticketId: string,
  input: { text: string; internal?: boolean; idempotencyKey?: string | null },
) {
  const current = await getAdminTicketOrThrow(app, ticketId);

  if (input.idempotencyKey) {
    const existing = await app.prisma.supportMessage.findFirst({
      where: { ticketId: current.id, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return adminTicket(current);
  }

  const now = new Date();
  await app.prisma.$transaction(async (tx) => {
    const message = await tx.supportMessage.create({
      data: {
        organizationId: current.organizationId,
        ticketId: current.id,
        authorUserId: actorUserId,
        role: input.internal ? 'ADMIN' : 'AGENT',
        text: input.text,
        internal: Boolean(input.internal),
        attachments: [],
        idempotencyKey: input.idempotencyKey || null,
      },
    });
    await tx.supportTicket.update({
      where: { id: current.id },
      data: input.internal ? {
        adminUnreadCount: 0,
      } : {
        adminUnreadCount: 0,
        clientUnreadCount: { increment: 1 },
        firstResponseAt: current.firstResponseAt || now,
        lastAgentMessageAt: now,
        status: ['OPEN', 'CLOSED'].includes(current.status) ? 'IN_PROGRESS' : current.status,
        closedAt: current.status === 'CLOSED' ? null : current.closedAt,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: current.organizationId,
        actorUserId,
        action: input.internal ? 'support.note.admin' : 'support.message.agent',
        entityType: 'SupportTicket',
        entityId: current.id,
        metadata: { messageId: message.id },
      },
    });
  });

  return adminTicket(await getAdminTicketOrThrow(app, ticketId));
}
