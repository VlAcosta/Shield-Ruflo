#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'P20 type-fix anchor not found: {path}\n{old[:500]}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'fixed {path}')


patch('backend/src/modules/cases/cases.routes.ts', '''    const tenant = context(request);
    return listCases(app, tenant.organizationId, caseListQuerySchema.parse(request.query));
''', '''    const tenant = context(request);
    const query = caseListQuerySchema.parse(request.query);
    return listCases(app, tenant.organizationId, {
      limit: query.limit,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.severity !== undefined ? { severity: query.severity } : {}),
      ...(query.ownerMemberId !== undefined ? { ownerMemberId: query.ownerMemberId } : {}),
      ...(query.locationId !== undefined ? { locationId: query.locationId } : {}),
      ...(query.category !== undefined ? { category: query.category } : {}),
      ...(query.overdue !== undefined ? { overdue: query.overdue } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
''')

patch('backend/src/modules/cases/cases.routes.ts', '''    const body = transitionCaseSchema.parse(request.body);
    return { case: await transitionReputationCase(app, tenant, caseId, body.status, { note: body.note, resolution: body.resolution }) };
''', '''    const body = transitionCaseSchema.parse(request.body);
    return {
      case: await transitionReputationCase(app, tenant, caseId, body.status, {
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.resolution !== undefined ? { resolution: body.resolution } : {}),
      }),
    };
''')

patch('backend/src/modules/cases/cases.routes.ts', '''    const { caseId } = caseIdParamsSchema.parse(request.params);
    const task = await addCaseTask(app, tenant, caseId, caseTaskSchema.parse(request.body));
    return reply.code(201).send({ task });
''', '''    const { caseId } = caseIdParamsSchema.parse(request.params);
    const body = caseTaskSchema.parse(request.body);
    const task = await addCaseTask(app, tenant, caseId, {
      title: body.title,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.deadline !== undefined ? { deadline: body.deadline } : {}),
      ...(body.assigneeMemberIds !== undefined ? { assigneeMemberIds: body.assigneeMemberIds } : {}),
    });
    return reply.code(201).send({ task });
''')

patch('backend/src/modules/cases/cases.service.ts', '''import type {
  Prisma,
  PrismaClient,
  ReputationCaseMetricPhase,
  ReputationCaseSeverity,
  ReputationCaseStatus,
  ReviewSentiment,
} from '../../generated/prisma/client.js';
''', '''import { Prisma } from '../../generated/prisma/client.js';
import type {
  PrismaClient,
  ReputationCaseMetricPhase,
  ReputationCaseSeverity,
  ReputationCaseStatus,
  ReviewSentiment,
} from '../../generated/prisma/client.js';
''')

patch('backend/src/modules/cases/cases.service.ts', '''          createdByUserId: context.userId,
          reviews: reviewIds.length ? { createMany: { data: reviewIds.map((reviewId) => ({ reviewId })), skipDuplicates: true } } : undefined,
          locations: locationIds.length ? { createMany: { data: locationIds.map((locationId) => ({ locationId })), skipDuplicates: true } } : undefined,
''', '''          createdByUserId: context.userId,
          ...(reviewIds.length ? { reviews: { createMany: { data: reviewIds.map((reviewId) => ({ reviewId })), skipDuplicates: true } } } : {}),
          ...(locationIds.length ? { locations: { createMany: { data: locationIds.map((locationId) => ({ locationId })), skipDuplicates: true } } } : {}),
''')

patch('backend/src/modules/cases/cases.service.ts', '''        metadata: input.note ? { note: input.note } : undefined,
''', '''        ...(input.note ? { metadata: { note: input.note } } : {}),
''')
patch('backend/src/modules/cases/cases.service.ts', '''      data: { organizationId: context.organizationId, caseId: existing.id, actorUserId: context.userId, action: 'case.verified', fromStatus: 'RESOLVED', toStatus: 'VERIFIED', metadata: note ? { note } : undefined },
''', '''      data: {
        organizationId: context.organizationId,
        caseId: existing.id,
        actorUserId: context.userId,
        action: 'case.verified',
        fromStatus: 'RESOLVED',
        toStatus: 'VERIFIED',
        ...(note ? { metadata: { note } } : {}),
      },
''')
patch('backend/src/modules/cases/cases.service.ts', '''    app.prisma.reputationCaseActivity.create({ data: { organizationId: context.organizationId, caseId: existing.id, actorUserId: context.userId, action: 'case.closed', fromStatus: 'VERIFIED', toStatus: 'CLOSED', metadata: note ? { note } : undefined } }),
''', '''    app.prisma.reputationCaseActivity.create({
      data: {
        organizationId: context.organizationId,
        caseId: existing.id,
        actorUserId: context.userId,
        action: 'case.closed',
        fromStatus: 'VERIFIED',
        toStatus: 'CLOSED',
        ...(note ? { metadata: { note } } : {}),
      },
    }),
''')

patch('backend/src/modules/cases/cases.service.ts', '''  const task = await createTask(app, context, {
    title: input.title,
    description: input.description,
    priority: input.priority,
    deadline: input.deadline,
    reviewId: caseRow.reviews[0]?.reviewId ?? null,
    locationId: caseRow.locations[0]?.locationId ?? null,
    caseId: caseRow.id,
    assigneeMemberIds: input.assigneeMemberIds,
  });
''', '''  const task = await createTask(app, context, {
    title: input.title,
    reviewId: caseRow.reviews[0]?.reviewId ?? null,
    locationId: caseRow.locations[0]?.locationId ?? null,
    caseId: caseRow.id,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
    ...(input.assigneeMemberIds !== undefined ? { assigneeMemberIds: input.assigneeMemberIds } : {}),
  });
''')

print('P20 strict optional type fixes applied')
