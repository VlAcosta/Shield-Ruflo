import { env } from '../../config/env.js';

export function readCookie(cookieHeader: string | undefined, name: string): string {
  if (!cookieHeader) return '';

  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return '';
}

function sameSiteValue(): string {
  switch (env.AUTH_COOKIE_SAME_SITE) {
    case 'strict': return 'Strict';
    default: return 'Lax';
  }
}

export function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  const attributes = [
    `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    `SameSite=${sameSiteValue()}`,
  ];

  if (env.AUTH_COOKIE_SECURE) attributes.push('Secure');
  if (env.AUTH_COOKIE_DOMAIN) attributes.push(`Domain=${env.AUTH_COOKIE_DOMAIN}`);

  return attributes.join('; ');
}

export function serializeClearedSessionCookie(): string {
  const attributes = [
    `${env.AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `SameSite=${sameSiteValue()}`,
  ];

  if (env.AUTH_COOKIE_SECURE) attributes.push('Secure');
  if (env.AUTH_COOKIE_DOMAIN) attributes.push(`Domain=${env.AUTH_COOKIE_DOMAIN}`);

  return attributes.join('; ');
}
