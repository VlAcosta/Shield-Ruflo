import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

export const WEBHOOK_EVENT_TYPES = [
  'review.created',
  'review.updated',
  'case.created',
  'case.updated',
  'case.resolved',
  'reply.published',
  'location.health_changed',
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENT_TYPES)[number];

const EVENT_TO_DB = Object.freeze({
  'review.created': 'REVIEW_CREATED',
  'review.updated': 'REVIEW_UPDATED',
  'case.created': 'CASE_CREATED',
  'case.updated': 'CASE_UPDATED',
  'case.resolved': 'CASE_RESOLVED',
  'reply.published': 'REPLY_PUBLISHED',
  'location.health_changed': 'LOCATION_HEALTH_CHANGED',
} as const);

const DB_TO_EVENT = Object.freeze(Object.fromEntries(
  Object.entries(EVENT_TO_DB).map(([event, value]) => [value, event]),
) as Record<string, WebhookEventName>);

export function toDbWebhookEvent(event: WebhookEventName) {
  return EVENT_TO_DB[event];
}

export function fromDbWebhookEvent(event: string): WebhookEventName {
  const value = DB_TO_EVENT[event];
  if (!value) throw new Error(`Unsupported webhook event enum: ${event}`);
  return value;
}

export function createWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('base64url')}`;
}

export function webhookSecretHint(secret: string): string {
  return `${secret.slice(0, 14)}…`;
}

export function signWebhookPayload(secret: string, timestamp: number, body: string): string {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  return `v1=${digest}`;
}

function ipv4Octets(address: string): number[] {
  return address.split('.').map((part) => Number(part));
}

function isPrivateIpv4(address: string): boolean {
  const [a = -1, b = -1] = ipv4Octets(address);
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a >= 224 && a <= 255);
}

function normalizeIpv6(address: string): string {
  return address.toLowerCase().split('%')[0] ?? address.toLowerCase();
}

function isPrivateIpv6(address: string): boolean {
  const value = normalizeIpv6(address);
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith('ff')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)?.[1];
  return mapped ? isPrivateIpv4(mapped) : false;
}

export function isBlockedWebhookAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

export function validateWebhookUrlShape(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('WEBHOOK_URL_INVALID');
  }
  if (url.protocol !== 'https:') throw new Error('WEBHOOK_HTTPS_REQUIRED');
  if (url.username || url.password) throw new Error('WEBHOOK_URL_CREDENTIALS_FORBIDDEN');
  if (url.hostname.toLowerCase() === 'localhost' || url.hostname.toLowerCase().endsWith('.localhost')) {
    throw new Error('WEBHOOK_PRIVATE_TARGET_FORBIDDEN');
  }
  const literalFamily = net.isIP(url.hostname);
  if (literalFamily && isBlockedWebhookAddress(url.hostname)) throw new Error('WEBHOOK_PRIVATE_TARGET_FORBIDDEN');
  return url;
}

export type ResolvedWebhookTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export type WebhookResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultResolver: WebhookResolver = async (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

export async function resolveSafeWebhookTarget(rawUrl: string, resolver: WebhookResolver = defaultResolver): Promise<ResolvedWebhookTarget> {
  const url = validateWebhookUrlShape(rawUrl);
  const literalFamily = net.isIP(url.hostname);
  if (literalFamily) return { url, address: url.hostname, family: literalFamily as 4 | 6 };

  const addresses = await resolver(url.hostname);
  if (!addresses.length) throw new Error('WEBHOOK_DNS_EMPTY');
  const normalized = addresses.map((item) => ({
    address: item.address,
    family: item.family === 6 ? 6 as const : 4 as const,
  }));
  if (normalized.some((item) => isBlockedWebhookAddress(item.address))) {
    throw new Error('WEBHOOK_PRIVATE_TARGET_FORBIDDEN');
  }
  return { url, ...normalized[0]! };
}

export type WebhookHttpResult = {
  statusCode: number;
  body: string;
  durationMs: number;
};

export async function postSignedWebhook(input: {
  target: ResolvedWebhookTarget;
  body: string;
  eventId: string;
  eventType: WebhookEventName;
  timestamp: number;
  attempt: number;
  signature: string;
  timeoutMs?: number;
}): Promise<WebhookHttpResult> {
  const timeoutMs = input.timeoutMs ?? 10_000;
  const started = Date.now();

  return new Promise<WebhookHttpResult>((resolve, reject) => {
    const request = https.request(input.target.url, {
      method: 'POST',
      servername: input.target.url.hostname,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(input.body),
        'user-agent': 'Business-Shield-Webhooks/1.0',
        'x-business-shield-event-id': input.eventId,
        'x-business-shield-event': input.eventType,
        'x-business-shield-timestamp': String(input.timestamp),
        'x-business-shield-attempt': String(input.attempt),
        'x-business-shield-signature': input.signature,
      },
      lookup: (_hostname, _options, callback) => callback(null, input.target.address, input.target.family),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer | string) => {
        if (size >= 32_768) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = 32_768 - size;
        chunks.push(buffer.subarray(0, remaining));
        size += Math.min(buffer.length, remaining);
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          durationMs: Date.now() - started,
        });
      });
    });

    request.setTimeout(timeoutMs, () => request.destroy(new Error('WEBHOOK_DELIVERY_TIMEOUT')));
    request.on('error', reject);
    request.end(input.body);
  });
}
