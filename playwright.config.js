import { defineConfig } from '@playwright/test';

const frontendUrl = process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:3000';
const backendUrl = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:8081';
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL || '';

if (!e2eDatabaseUrl || !/(?:test|p0|e2e)/.test(new URL(e2eDatabaseUrl).pathname.toLowerCase())) {
  throw new Error('E2E_DATABASE_URL must name an explicitly isolated test database');
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm run dev --prefix backend',
      url: `${backendUrl}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: e2eDatabaseUrl,
        HOST: '127.0.0.1',
        PORT: '8081',
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        CORS_ORIGINS: frontendUrl,
        AUTH_COOKIE_SECURE: 'false',
        AUTH_OTP_PROVIDER: 'console',
        AUTH_OTP_FIXED_CODE: '8462',
        AUTH_EXPOSE_DEBUG_CODE: 'true',
        AUTH_OTP_IP_MAX_REQUESTS: '100',
      },
    },
    {
      command: 'npm start',
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        E2E_DATABASE_URL: e2eDatabaseUrl,
        BROWSER: 'none',
        HOST: '127.0.0.1',
        PORT: '3000',
        REACT_APP_API_BASE: `${backendUrl}/api/v1`,
      },
    },
  ],
});
