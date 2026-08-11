import 'dotenv/config';
import { isIP } from 'node:net';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const optionalUrl = z.union([z.literal(''), z.string().url()]).default('');
const optionalEmail = z.union([z.literal(''), z.string().email()]).default('');
const identityList = z.string().default('').transform((value) => value
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean));

function isTrustedProxyEntry(value: string): boolean {
  if (value === 'loopback') return true;
  const [address, prefix, ...rest] = value.split('/');
  if (!address || rest.length > 0) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d+$/.test(prefix)) return false;
  const prefixLength = Number(prefix);
  return prefixLength >= 0 && prefixLength <= (family === 4 ? 32 : 128);
}

export function parseTrustedProxyConfig(value: string): false | string[] {
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return entries.length === 0 ? false : entries;
}

export function isTrustedProxyConfig(value: string): boolean {
  const parsed = parseTrustedProxyConfig(value);
  return parsed === false || parsed.every(isTrustedProxyEntry);
}

const trustedProxySchema = z.string().default('').refine(
  isTrustedProxyConfig,
  'TRUST_PROXY must contain only exact IPs, CIDRs, or loopback',
).transform(parseTrustedProxyConfig);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('Business Shield API'),
    APP_VERSION: z.string().min(1).default('0.5.0'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8081),
    TRUST_PROXY: trustedProxySchema,
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
    PLATFORM_ADMIN_IDENTITIES: identityList,

    AUTH_SECRET: z.string().min(32).default('development-only-auth-secret-change-me-now'),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(31_536_000).default(2_592_000),
    AUTH_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('bs_session'),
    AUTH_COOKIE_DOMAIN: z.string().regex(/^$|^\.?[A-Za-z0-9.-]+$/).default(''),
    AUTH_COOKIE_SECURE: booleanFromString.default(false),
    AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict']).default('lax'),

    AUTH_OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    AUTH_OTP_RESEND_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
    AUTH_OTP_IP_MAX_REQUESTS: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_OTP_IP_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
    AUTH_OTP_PROVIDER: z.enum(['console', 'webhook', 'smsaero']).default('console'),
    AUTH_OTP_FIXED_CODE: z.union([z.literal(''), z.string().regex(/^\d{4}$/)]).default(''),
    AUTH_EXPOSE_DEBUG_CODE: booleanFromString.default(false),
    AUTH_OTP_WEBHOOK_URL: optionalUrl,
    AUTH_OTP_WEBHOOK_TOKEN: z.string().default(''),
    AUTH_OTP_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
    SMSAERO_EMAIL: optionalEmail,
    SMSAERO_API_KEY: z.string().trim().default(''),
    SMSAERO_SIGN: z.string().trim().min(1).max(32).default('SMS Aero'),
    SMSAERO_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),

    COMPANY_LOOKUP_PROVIDER: z.enum(['disabled', 'mock', 'webhook']).default('disabled'),
    COMPANY_LOOKUP_WEBHOOK_URL: optionalUrl,
    COMPANY_LOOKUP_WEBHOOK_TOKEN: z.string().default(''),
    COMPANY_LOOKUP_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),

    INTEGRATION_CREDENTIALS_KEY: z.string().min(32).default('development-integration-credential-key-change-me'),

    GOOGLE_BUSINESS_ENABLED: booleanFromString.default(false),
    GOOGLE_BUSINESS_CLIENT_ID: z.string().default(''),
    GOOGLE_BUSINESS_CLIENT_SECRET: z.string().default(''),
    GOOGLE_BUSINESS_REDIRECT_URI: optionalUrl,
    GOOGLE_BUSINESS_RETURN_URL: optionalUrl,
    GOOGLE_BUSINESS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),

    GOOGLE_PLACES_ENABLED: booleanFromString.default(false),
    GOOGLE_PLACES_API_KEY: z.string().trim().default(''),
    GOOGLE_PLACES_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),

    AI_REVIEW_INTELLIGENCE_ENABLED: booleanFromString.default(false),
    AI_OPENAI_API_KEY: z.string().default(''),
    AI_OPENAI_MODEL: z.string().default(''),
    AI_OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    AI_OPENAI_INPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).default(0),
    AI_OPENAI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().min(0).default(0),
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

    if (value.AUTH_OTP_PROVIDER === 'smsaero') {
      if (!value.SMSAERO_EMAIL) {
        ctx.addIssue({ code: 'custom', path: ['SMSAERO_EMAIL'], message: 'SMS Aero OTP delivery requires an account email' });
      }
      if (!value.SMSAERO_API_KEY) {
        ctx.addIssue({ code: 'custom', path: ['SMSAERO_API_KEY'], message: 'SMS Aero OTP delivery requires an API key' });
      }
    }

    if (value.AI_REVIEW_INTELLIGENCE_ENABLED) {
      if (!value.AI_OPENAI_API_KEY) {
        ctx.addIssue({ code: 'custom', path: ['AI_OPENAI_API_KEY'], message: 'AI Review Intelligence requires an AI provider API key' });
      }
      if (!value.AI_OPENAI_MODEL) {
        ctx.addIssue({ code: 'custom', path: ['AI_OPENAI_MODEL'], message: 'AI Review Intelligence requires an explicit model' });
      }
    }

    if (value.GOOGLE_BUSINESS_ENABLED) {
      if (!value.GOOGLE_BUSINESS_CLIENT_ID) {
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_BUSINESS_CLIENT_ID'], message: 'Google Business Profile requires an OAuth client id' });
      }
      if (!value.GOOGLE_BUSINESS_CLIENT_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_BUSINESS_CLIENT_SECRET'], message: 'Google Business Profile requires an OAuth client secret' });
      }
      if (!value.GOOGLE_BUSINESS_REDIRECT_URI) {
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_BUSINESS_REDIRECT_URI'], message: 'Google Business Profile requires an OAuth redirect URI' });
      }
      if (!value.GOOGLE_BUSINESS_RETURN_URL) {
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_BUSINESS_RETURN_URL'], message: 'Google Business Profile requires a frontend return URL' });
      }
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
      if (value.INTEGRATION_CREDENTIALS_KEY === 'development-integration-credential-key-change-me') {
        ctx.addIssue({ code: 'custom', path: ['INTEGRATION_CREDENTIALS_KEY'], message: 'Production requires a unique integration credential encryption key' });
      }
      if (value.GOOGLE_BUSINESS_ENABLED && !value.GOOGLE_BUSINESS_REDIRECT_URI.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_BUSINESS_REDIRECT_URI'], message: 'Production Google OAuth redirect URI must use HTTPS' });
      }
      if (value.GOOGLE_BUSINESS_ENABLED && !value.GOOGLE_BUSINESS_RETURN_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_BUSINESS_RETURN_URL'], message: 'Production Google OAuth return URL must use HTTPS' });
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
