import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createOtpCode(fixedCode = ''): string {
  if (fixedCode) return fixedCode;
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

export function hashOtpCode(input: {
  secret: string;
  challengeId: string;
  phone: string;
  purpose: string;
  code: string;
}): string {
  return createHmac('sha256', input.secret)
    .update(`${input.challengeId}:${input.phone}:${input.purpose}:${input.code}`, 'utf8')
    .digest('hex');
}

export function secureHashEquals(expectedHex: string, actualHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex) || !/^[a-f0-9]{64}$/i.test(actualHex)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'));
}
