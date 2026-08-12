import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

function getHttpStatusCode(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return 500;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : 500;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request rejected';
}

function serializedError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const candidate = error as {
    message?: unknown;
    meta?: { database_error?: unknown; message?: unknown };
    cause?: { message?: unknown };
  };
  return [
    candidate.message,
    candidate.meta?.database_error,
    candidate.meta?.message,
    candidate.cause?.message,
  ].filter((value): value is string => typeof value === 'string').join('\n');
}

function planLimitDetails(error: unknown): Record<string, unknown> | undefined {
  const serialized = serializedError(error);
  if (!serialized.includes('PLAN_LIMIT_REACHED')) return undefined;

  const detailMatch = serialized.match(/DETAIL:\s*(\{[^\n]+\})/i);
  if (!detailMatch?.[1]) return { upgradeRequired: true };
  try {
    const parsed = JSON.parse(detailMatch[1]);
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : { upgradeRequired: true };
  } catch {
    return { upgradeRequired: true };
  }
}

function retryAfterSeconds(error: AppError): number | null {
  if (error.statusCode !== 429 || !error.details || typeof error.details !== 'object') return null;
  const retryAfter = (error.details as { retryAfter?: unknown }).retryAfter;
  return typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.max(1, Math.ceil(retryAfter))
    : null;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn(
        { err: error, code: error.code, details: error.details },
        'Application error',
      );

      const retryAfter = retryAfterSeconds(error);
      if (retryAfter !== null) reply.header('retry-after', String(retryAfter));

      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId: request.id,
          details: error.flatten(),
        },
      });
    }

    const limitDetails = planLimitDetails(error);
    if (limitDetails) {
      request.log.warn({ err: error, details: limitDetails }, 'Plan hard limit rejected by database backstop');
      return reply.status(409).send({
        error: {
          code: 'PLAN_LIMIT_REACHED',
          message: 'Достигнут лимит текущего тарифа',
          requestId: request.id,
          details: limitDetails,
        },
      });
    }

    const statusCode = getHttpStatusCode(error);

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled request error');
    } else {
      request.log.warn({ err: error }, 'Request rejected');
    }

    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : getErrorMessage(error),
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id,
      },
    });
  });
}
