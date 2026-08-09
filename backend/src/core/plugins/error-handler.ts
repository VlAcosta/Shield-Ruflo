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

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn(
        { err: error, code: error.code, details: error.details },
        'Application error',
      );

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
