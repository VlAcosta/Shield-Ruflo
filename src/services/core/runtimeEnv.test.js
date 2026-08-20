import { getRuntimeEnv } from './runtimeEnv';

describe('runtime endpoint defaults', () => {
  const originalRuntime = window.__BUSINESS_SHIELD_ENV__;

  afterEach(() => {
    if (originalRuntime === undefined) delete window.__BUSINESS_SHIELD_ENV__;
    else window.__BUSINESS_SHIELD_ENV__ = originalRuntime;
  });

  test('derives dashboard and feature endpoints from the active API base', () => {
    window.__BUSINESS_SHIELD_ENV__ = {
      API_BASE: 'http://127.0.0.1:8081/api/v1/',
    };

    expect(getRuntimeEnv('DASHBOARD_OVERVIEW_ENDPOINT'))
      .toBe('http://127.0.0.1:8081/api/v1/dashboard/overview');
    expect(getRuntimeEnv('DASHBOARD_LAYOUT_ENDPOINT'))
      .toBe('http://127.0.0.1:8081/api/v1/dashboard/layout');
    expect(getRuntimeEnv('TASKS_ENDPOINT'))
      .toBe('http://127.0.0.1:8081/api/v1/tasks');
    expect(getRuntimeEnv('REPORTS_ENDPOINT'))
      .toBe('http://127.0.0.1:8081/api/v1/reports');
  });

  test('keeps an explicit endpoint override authoritative', () => {
    window.__BUSINESS_SHIELD_ENV__ = {
      API_BASE: 'http://127.0.0.1:8081/api/v1',
      DASHBOARD_OVERVIEW_ENDPOINT: 'https://dashboard.example.test/overview',
    };

    expect(getRuntimeEnv('DASHBOARD_OVERVIEW_ENDPOINT'))
      .toBe('https://dashboard.example.test/overview');
  });
});
