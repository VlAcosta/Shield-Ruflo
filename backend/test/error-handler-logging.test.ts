import { describe, expect, it } from 'vitest';
import { appErrorLogLevel } from '../src/core/plugins/error-handler.js';

describe('appErrorLogLevel', () => {
  it('logs expected client/auth failures at info level', () => {
    expect(appErrorLogLevel(400)).toBe('info');
    expect(appErrorLogLevel(401)).toBe('info');
    expect(appErrorLogLevel(403)).toBe('info');
    expect(appErrorLogLevel(404)).toBe('info');
    expect(appErrorLogLevel(422)).toBe('info');
  });

  it('keeps operational client pressure/conflict signals at warn level', () => {
    expect(appErrorLogLevel(409)).toBe('warn');
    expect(appErrorLogLevel(429)).toBe('warn');
  });

  it('keeps server failures at error level', () => {
    expect(appErrorLogLevel(500)).toBe('error');
    expect(appErrorLogLevel(503)).toBe('error');
  });
});
