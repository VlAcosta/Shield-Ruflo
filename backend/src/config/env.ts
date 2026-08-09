import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalUrl = z.union([z.literal(''), z.string().url()]).default('');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('Business Shield API'),
    APP_VERSION: z.string().min(1).default('0.5.0'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8081),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://business_shield:business_shield@localhost:5433/business_shield'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    SWAGGER_ENABLED: booleanFromString.default(true),

    AUTH_SECRET: z.string().min(32).default('development-only-auth-secret-change-me-now'),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(31_536_000).default(2_592_000),
    AUTH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('bs_session'),
    AUTH_COOKIE_DOMAIN: z.string().regex(/^$|^\.?[A-Za-z0-9.-]+$/).default(''),
    AUTH_COOKIE_SECURE: booleanFromString.default(false),
    AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    AUTH_OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    AUTH_OTP_RESEND_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
    AUTH_OTP_IP_MAX_REQUESTS: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_OTP_IP_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
    AUTH_OTP_PROVIDER: z.enum(['console', 'webhook']).default('console'),
    AUTH_OTP_FIXED_CODE: z.union([z.literal(''), z.string().regex(/^\d{4}$/)]).default(''),
    AUTH_EXPOSE_DEBUG_CODE: booleanFromString.default(false),
    AUTH_OTP_WEBHOOK_URL: optionalUrl,
    AUTH_OTP_WEBHOOK_TOKEN: z.string().default(''),
    AUTH_OTP_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),

    COMPANY_LOOKUP_PROVIDER: z.enum(['disabled', 'mock', 'webhook']).default('disabled'),
    COMPANY_LOOKUP_WEBHOOK_URL: optionalUrl,
    COMPANY_LOOKUP_WEBHOOK_TOKEN: z.string().default(''),
    COMPANY_LOOKUP_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  })
  .superRefine((value, ctx) => {
    if (value.COMPANY_LOOKUP_PROVIDER === 'webhook' && !value.COMPANY_LOOKUP_WEBHOOK_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['COMPANY_LOOKUP_WEBHOOK_URL'],
        message: 'COMPANY_LOOKUP_WEBHOOK_URL is required when COMPANY_LOOKUP_PROVIDER=webhook',
      });
    }

    if (value.AUTH_OTP_PROVIDER === 'webhook' && !value.AUTH_OTP_WEBHOOK_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_OTP_WEBHOOK_URL'],
        message: 'AUTH_OTP_WEBHOOK_URL is required when AUTH_OTP_PROVIDER=webhook',
      });
    }

    if (value.AUTH_COOKIE_SAME_SITE === 'none' && !value.AUTH_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE=none',
      });
    }

    if (value.NODE_ENV === 'production') {
      if (value.AUTH_SECRET === 'development-only-auth-secret-change-me-now') {
        ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET'], message: 'Production requires a unique AUTH_SECRET' });
      }
      if (!value.AUTH_COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_COOKIE_SECURE'], message: 'Production auth cookies must be Secure' });
      }
      if (value.AUTH_OTP_PROVIDER === 'console') {
        ctx.addIssue({ code: 'custom', path: ['AUTH_OTP_PROVIDER'], message: 'Console OTP delivery is forbidden in production' });
      }
      if (value.AUTH_OTP_PROVIDER === 'webhook' && !value.AUTH_OTP_WEBHOOK_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_OTP_WEBHOOK_URL'], message: 'Production OTP webhook must use HTTPS' });
      }
      if (value.AUTH_OTP_FIXED_CODE) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_OTP_FIXED_CODE'], message: 'Fixed OTP is forbidden in production' });
      }
      if (value.AUTH_EXPOSE_DEBUG_CODE) {
        ctx.addIssue({ code: 'custom', path: ['AUTH_EXPOSE_DEBUG_CODE'], message: 'Debug OTP exposure is forbidden in production' });
      }
      if (value.COMPANY_LOOKUP_PROVIDER === 'mock') {
        ctx.addIssue({ code: 'custom', path: ['COMPANY_LOOKUP_PROVIDER'], message: 'Mock company lookup is forbidden in production' });
      }
      if (value.COMPANY_LOOKUP_PROVIDER === 'webhook' && !value.COMPANY_LOOKUP_WEBHOOK_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['COMPANY_LOOKUP_WEBHOOK_URL'], message: 'Production company lookup webhook must use HTTPS' });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid backend environment: ${issues}`);
}

export const env = parsed.data;
export type AppEnv = typeof env;
