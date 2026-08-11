import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  caseIdParamsSchema,
  caseListQuerySchema,
  caseTaskSchema,
  createCaseSchema,
  reopenCaseSchema,
  reviewCaseParamsSchema,
  transitionCaseSchema,
  updateCaseSchema,
  verifyCaseSchema,
} from './cases.schemas.js';
import {
  addCaseTask,
  closeReputationCase,
  createCaseFromReview,
  createReputationCase,
  getCase,
  getCaseOutcome,
  listCases,
  transitionReputationCase,
  updateReputationCase,
  verifyReputationCase,
} from './cases.service.js';

function context(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const casesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cases', { preHandler: [app.authenticate, app.authorize('cases.view')] }, async (request) => {
    const tenant = context(request);
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
  });

  app.get('/cases/:caseId', { preHandler: [app.authenticate, app.authorize('cases.view')] }, async (request) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    return { case: await getCase(app, tenant.organizationId, caseId) };
  });

  app.post('/cases', { preHandler: [app.authenticate, app.authorize('cases.manage')] }, async (request, reply) => {
    const tenant = context(request);
    const result = await createReputationCase(app, tenant, createCaseSchema.parse(request.body));
    return reply.code(result.deduplicated ? 200 : 201).send(result);
  });

  app.post('/reviews/:reviewId/case', { preHandler: [app.authenticate, app.authorize('cases.manage')] }, async (request, reply) => {
    const tenant = context(request);
    const { reviewId } = reviewCaseParamsSchema.parse(request.params);
    const body = createCaseSchema.omit({ reviewIds: true, origin: true }).parse(request.body);
    const result = await createCaseFromReview(app, tenant, reviewId, { ...body, origin: 'REVIEW' });
    return reply.code(result.deduplicated ? 200 : 201).send(result);
  });

  app.patch('/cases/:caseId', { preHandler: [app.authenticate, app.authorize('cases.manage')] }, async (request) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    return { case: await updateReputationCase(app, tenant, caseId, updateCaseSchema.parse(request.body)) };
  });

  app.post('/cases/:caseId/transition', { preHandler: [app.authenticate, app.authorize('cases.manage')] }, async (request) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    const body = transitionCaseSchema.parse(request.body);
    return {
      case: await transitionReputationCase(app, tenant, caseId, body.status, {
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.resolution !== undefined ? { resolution: body.resolution } : {}),
      }),
    };
  });

  app.post('/cases/:caseId/verify', { preHandler: [app.authenticate, app.authorize('cases.verify')] }, async (request) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    const { note } = verifyCaseSchema.parse(request.body ?? {});
    return { case: await verifyReputationCase(app, tenant, caseId, note) };
  });

  app.post('/cases/:caseId/close', { preHandler: [app.authenticate, app.authorize('cases.verify')] }, async (request) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    const { note } = verifyCaseSchema.parse(request.body ?? {});
    return { case: await closeReputationCase(app, tenant, caseId, note) };
  });

  app.post('/cases/:caseId/reopen', { preHandler: [app.authenticate, app.authorize('cases.manage')] }, async (request) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    const { note } = reopenCaseSchema.parse(request.body);
    return { case: await transitionReputationCase(app, tenant, caseId, 'IN_PROGRESS', { note }) };
  });

  app.post('/cases/:caseId/tasks', { preHandler: [app.authenticate, app.authorize('cases.manage'), app.authorize('tasks.manage')] }, async (request, reply) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    const body = caseTaskSchema.parse(request.body);
    const task = await addCaseTask(app, tenant, caseId, {
      title: body.title,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.deadline !== undefined ? { deadline: body.deadline } : {}),
      ...(body.assigneeMemberIds !== undefined ? { assigneeMemberIds: body.assigneeMemberIds } : {}),
    });
    return reply.code(201).send({ task });
  });

  app.get('/cases/:caseId/outcome', { preHandler: [app.authenticate, app.authorize('cases.view')] }, async (request) => {
    const tenant = context(request);
    const { caseId } = caseIdParamsSchema.parse(request.params);
    return getCaseOutcome(app, tenant.organizationId, caseId);
  });
};
