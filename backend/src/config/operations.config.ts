import 'dotenv/config';
import { z } from 'zod';

const DEVELOPMENT_METRICS_TOKEN = 'development-only-operations-metrics-token-change-me';

const operationsSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OPERATIONS_METRICS_TOKEN: z.string().min(32).default(DEVELOPMENT_METRICS_TOKEN),
  AI_RATE_LIMIT_USER_PER_MINUTE: z.coerce.number().int().min(1).max(1_000).default(20),
  AI_RATE_LIMIT_TENANT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(100),
}).superRefine((value, ctx) => {
  if (value.AI_RATE_LIMIT_TENANT_PER_MINUTE < value.AI_RATE_LIMIT_USER_PER_MINUTE) {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_RATE_LIMIT_TENANT_PER_MINUTE'],
      message: 'Tenant AI request budget must be greater than or equal to the per-user budget',
    });
  }

  if (value.NODE_ENV === 'production' && value.OPERATIONS_METRICS_TOKEN === DEVELOPMENT_METRICS_TOKEN) {
    ctx.addIssue({
      code: 'custom',
      path: ['OPERATIONS_METRICS_TOKEN'],
      message: 'Production requires a unique OPERATIONS_METRICS_TOKEN',
    });
  }
});

const parsed = operationsSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid operations environment: ${issues}`);
}

export const operationsConfig = parsed.data;
export type OperationsConfig = typeof operationsConfig;
