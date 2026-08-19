import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { operationsConfig } from '../../config/operations.config.js';

type BudgetScope = 'user' | 'tenant';

type BudgetRow = {
  count: number;
  windowStartedAt: Date;
};

export type AiRequestBudgetOptions = {
  userLimit?: number;
  tenantLimit?: number;
  windowSeconds?: number;
};

function secondsUntilReset(windowStartedAt: Date, windowSeconds: number): number {
  const resetAt = windowStartedAt.getTime() + windowSeconds * 1_000;
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1_000));
}

async function consumeBucket(
  tx: Prisma.TransactionClient,
  input: {
    key: string;
    scope: BudgetScope;
    organizationId: string;
    userId: string | null;
    windowSeconds: number;
  },
): Promise<BudgetRow> {
  const rows = await tx.$queryRaw<BudgetRow[]>`
    INSERT INTO "operational_rate_limit_buckets" (
      "key", "scope", "organization_id", "user_id", "window_started_at", "count", "updated_at"
    ) VALUES (
      ${input.key},
      ${input.scope},
      CAST(${input.organizationId} AS uuid),
      CAST(${input.userId} AS uuid),
      NOW(),
      1,
      NOW()
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "operational_rate_limit_buckets"."window_started_at" <= NOW() - make_interval(secs => ${input.windowSeconds})
          THEN 1
        ELSE "operational_rate_limit_buckets"."count" + 1
      END,
      "window_started_at" = CASE
        WHEN "operational_rate_limit_buckets"."window_started_at" <= NOW() - make_interval(secs => ${input.windowSeconds})
          THEN NOW()
        ELSE "operational_rate_limit_buckets"."window_started_at"
      END,
      "updated_at" = NOW()
    RETURNING
      "count",
      "window_started_at" AS "windowStartedAt"
  `;

  const row = rows[0];
  if (!row) throw new Error('Operational rate-limit bucket update returned no row');
  return row;
}

function reject(scope: BudgetScope, limit: number, row: BudgetRow, windowSeconds: number): never {
  const retryAfter = secondsUntilReset(row.windowStartedAt, windowSeconds);
  throw new AppError({
    code: 'AI_RATE_LIMITED',
    message: 'Слишком много AI-запросов. Повторите позже.',
    statusCode: 429,
    details: {
      scope,
      limit,
      windowSeconds,
      retryAfter,
    },
  });
}

export async function assertAiRequestBudget(
  app: FastifyInstance,
  input: { organizationId: string; userId: string },
  options: AiRequestBudgetOptions = {},
): Promise<void> {
  const userLimit = options.userLimit ?? operationsConfig.AI_RATE_LIMIT_USER_PER_MINUTE;
  const tenantLimit = options.tenantLimit ?? operationsConfig.AI_RATE_LIMIT_TENANT_PER_MINUTE;
  const windowSeconds = options.windowSeconds ?? 60;

  if (userLimit < 1 || tenantLimit < userLimit || windowSeconds < 1) {
    throw new Error('Invalid AI request budget configuration');
  }

  await app.prisma.$transaction(async (tx) => {
    const user = await consumeBucket(tx, {
      key: `ai:user:${input.organizationId}:${input.userId}`,
      scope: 'user',
      organizationId: input.organizationId,
      userId: input.userId,
      windowSeconds,
    });
    if (user.count > userLimit) reject('user', userLimit, user, windowSeconds);

    const tenant = await consumeBucket(tx, {
      key: `ai:tenant:${input.organizationId}`,
      scope: 'tenant',
      organizationId: input.organizationId,
      userId: null,
      windowSeconds,
    });
    if (tenant.count > tenantLimit) reject('tenant', tenantLimit, tenant, windowSeconds);
  });
}
