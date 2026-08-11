import fs from 'node:fs';

const path = 'backend/src/config/env.ts';
let text = fs.readFileSync(path, 'utf8');

const schemaAnchor = "    INTEGRATION_CREDENTIALS_KEY: z.string().min(32).default('development-integration-credential-key-change-me'),\n";
const schemaBlock = `${schemaAnchor}\n    BILLING_PROVIDER: z.enum(['disabled', 'yookassa']).default('disabled'),\n    YOOKASSA_SHOP_ID: z.string().trim().default(''),\n    YOOKASSA_SECRET_KEY: z.string().trim().default(''),\n    YOOKASSA_RETURN_URL: optionalUrl,\n    YOOKASSA_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),\n    YOOKASSA_RECEIPT_ENABLED: booleanFromString.default(false),\n    YOOKASSA_VAT_CODE: z.coerce.number().int().min(1).max(12).default(1),\n`;

if (!text.includes('BILLING_PROVIDER:')) {
  if (!text.includes(schemaAnchor)) throw new Error('billing env schema anchor not found');
  text = text.replace(schemaAnchor, schemaBlock);
}

const refineAnchor = "    if (value.AUTH_OTP_PROVIDER === 'webhook' && !value.AUTH_OTP_WEBHOOK_URL) {\n";
const refineBlock = `    if (value.BILLING_PROVIDER === 'yookassa') {\n      if (!/^\\d+$/.test(value.YOOKASSA_SHOP_ID)) {\n        ctx.addIssue({ code: 'custom', path: ['YOOKASSA_SHOP_ID'], message: 'YooKassa requires a numeric shopId' });\n      }\n      if (!value.YOOKASSA_SECRET_KEY) {\n        ctx.addIssue({ code: 'custom', path: ['YOOKASSA_SECRET_KEY'], message: 'YooKassa requires a secret key' });\n      }\n      if (!value.YOOKASSA_RETURN_URL) {\n        ctx.addIssue({ code: 'custom', path: ['YOOKASSA_RETURN_URL'], message: 'YooKassa requires a return URL' });\n      }\n    }\n\n${refineAnchor}`;

if (!text.includes("YooKassa requires a numeric shopId")) {
  if (!text.includes(refineAnchor)) throw new Error('billing env refine anchor not found');
  text = text.replace(refineAnchor, refineBlock);
}

const productionAnchor = "      if (value.INTEGRATION_CREDENTIALS_KEY === 'development-integration-credential-key-change-me') {\n        ctx.addIssue({ code: 'custom', path: ['INTEGRATION_CREDENTIALS_KEY'], message: 'Production requires a unique integration credential encryption key' });\n      }\n";
const productionBlock = `${productionAnchor}      if (value.BILLING_PROVIDER === 'yookassa' && !value.YOOKASSA_RETURN_URL.startsWith('https://')) {\n        ctx.addIssue({ code: 'custom', path: ['YOOKASSA_RETURN_URL'], message: 'Production YooKassa return URL must use HTTPS' });\n      }\n`;

if (!text.includes('Production YooKassa return URL must use HTTPS')) {
  if (!text.includes(productionAnchor)) throw new Error('billing production env anchor not found');
  text = text.replace(productionAnchor, productionBlock);
}

fs.writeFileSync(path, text);
console.log('Patched strict billing/YooKassa environment schema with disabled-by-default fail-safe.');
