const { test, expect } = require('@playwright/test');
const { Pool } = require('../backend/node_modules/pg');

const backendOrigin = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:8081';
const apiBase = `${backendOrigin}/api/v1`;
const fixedOtp = '8462';

async function expectOk(response, operation) {
  if (response.ok()) return response;
  throw new Error(`${operation} failed (${response.status()}): ${await response.text()}`);
}

async function registerWorkspace(api) {
  const phone = `+7994${String(Date.now()).slice(-7)}`;
  const challengeResponse = await expectOk(await api.post(`${apiBase}/auth/request-code`, {
    data: { phone, mode: 'register' },
  }), 'request OTP');
  const challenge = await challengeResponse.json();

  await expectOk(await api.post(`${apiBase}/auth/verify-code`, {
    data: {
      phone,
      code: challenge.debug_code || fixedOtp,
      session_id: challenge.session_id,
      mode: 'register',
    },
  }), 'verify OTP');

  const profileResponse = await expectOk(await api.post(`${apiBase}/auth/complete-profile`, {
    data: { phone, first_name: 'LAYOUT', last_name: 'Dashboard E2E', email: '' },
  }), 'complete profile');
  const profile = await profileResponse.json();
  return {
    userId: profile.user.id,
    organizationId: profile.user.membership.organizationId,
  };
}

async function prepareWorkspace(workspace) {
  const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    await pool.query(
      `UPDATE organizations
       SET onboarding_status = 'COMPLETED',
           onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
       WHERE id = $1::uuid`,
      [workspace.organizationId],
    );
  } finally {
    await pool.end();
  }
}

async function cleanupWorkspace(workspace) {
  if (!workspace) return;
  const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    await pool.query('DELETE FROM organizations WHERE id = $1::uuid', [workspace.organizationId]);
    await pool.query('DELETE FROM users WHERE id = $1::uuid', [workspace.userId]);
  } finally {
    await pool.end();
  }
}

test('Dashboard layout is persisted remotely and restored without local cache', async ({ page }) => {
  let workspace;
  await page.addInitScript((configuredApiBase) => {
    window.__BUSINESS_SHIELD_ENV__ = { API_BASE: configuredApiBase };
  }, apiBase);

  await page.goto('/');
  try {
    workspace = await registerWorkspace(page.request);
    await prepareWorkspace(workspace);
    await page.evaluate(() => {
      localStorage.setItem('portal_pin_code', '7391');
      localStorage.setItem('portal_pin_unlocked', '1');
    });

    const initialLayoutGet = page.waitForResponse((response) => (
      response.url() === `${apiBase}/dashboard/layout`
      && response.request().method() === 'GET'
    ));
    await page.goto('/dashboard');
    expect((await initialLayoutGet).ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Моя доска' })).toBeVisible();

    await page.getByRole('button', { name: /Добавить блок/ }).click();
    const processOption = page.locator('.dashboard-workspace__catalog-item')
      .filter({ hasText: 'Процессы' });
    const processCheckbox = processOption.locator('input[type="checkbox"]');
    await expect(processCheckbox).not.toBeChecked();

    const layoutPut = page.waitForResponse((response) => (
      response.url() === `${apiBase}/dashboard/layout`
      && response.request().method() === 'PUT'
    ));
    await processOption.click();
    await expect(processCheckbox).toBeChecked();
    await expect(page.locator('.dashboard-processes')).toBeVisible();

    const putResponse = await layoutPut;
    expect(putResponse.ok()).toBe(true);

    const storedResponse = await expectOk(
      await page.request.get(`${apiBase}/dashboard/layout`),
      'read persisted dashboard layout',
    );
    const stored = await storedResponse.json();
    expect(stored.layout.widgets.processes.visible).toBe(true);

    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter((key) => key.includes('business_shield_dashboard_layout'))
        .forEach((key) => localStorage.removeItem(key));
    });

    const restoreGet = page.waitForResponse((response) => (
      response.url() === `${apiBase}/dashboard/layout`
      && response.request().method() === 'GET'
    ));
    await page.reload();
    expect((await restoreGet).ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Моя доска' })).toBeVisible();
    await expect(page.locator('.dashboard-processes')).toBeVisible();
  } finally {
    await cleanupWorkspace(workspace);
  }
});
