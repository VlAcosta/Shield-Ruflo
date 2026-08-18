const { test, expect } = require('@playwright/test');
const { Pool } = require('../backend/node_modules/pg');

const backendOrigin = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:8081';
const apiBase = `${backendOrigin}/api/v1`;
const fixedOtp = '8462';

async function expectOk(response, operation) {
  if (response.ok()) return response;
  throw new Error(`${operation} failed (${response.status()}): ${await response.text()}`);
}

async function registerWorkspace(api, phone, firstName) {
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
    data: { phone, first_name: firstName, last_name: 'Dashboard E2E', email: '' },
  }), 'complete profile');
  const profile = await profileResponse.json();

  return {
    userId: profile.user.id,
    organizationId: profile.user.membership.organizationId,
  };
}

async function markOnboardingCompleted(workspace) {
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

async function unlockPortal(page) {
  await page.evaluate(() => {
    localStorage.setItem('portal_pin_code', '7391');
    localStorage.setItem('portal_pin_unlocked', '1');
  });
}

async function expectDashboardReady(page) {
  await expect.poll(() => page.evaluate(() => {
    const portal = document.querySelector('.portal');
    const workspace = document.querySelector('#dashboard-workspace');
    return {
      pathname: window.location.pathname,
      workspaceMounted: Boolean(workspace),
      portalLocked: portal ? portal.classList.contains('portal--locked') : null,
      workspaceAriaHidden: workspace?.closest('.portal__contentWrap')?.getAttribute('aria-hidden') || null,
      screen: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 260),
    };
  }), { timeout: 30_000 }).toMatchObject({
    pathname: '/dashboard',
    workspaceMounted: true,
    portalLocked: false,
    workspaceAriaHidden: null,
  });
}

async function assertNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => ({
    viewport: window.innerWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))).toEqual(expect.objectContaining({
    viewport: 480,
    root: expect.any(Number),
    body: expect.any(Number),
  }));

  const overflow = await page.evaluate(() => Math.max(
    0,
    document.documentElement.scrollWidth - window.innerWidth,
    document.body.scrollWidth - window.innerWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

test('Dashboard supports keyboard actions, catalog Escape flow and 480px mobile layout', async ({ page, context }) => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let workspace;

  await page.addInitScript((configuredApiBase) => {
    window.__BUSINESS_SHIELD_ENV__ = { API_BASE: configuredApiBase };
  }, apiBase);

  await page.goto('/');
  const browserApi = {
    post: (url, options) => page.request.post(url, options),
    get: (url, options) => page.request.get(url, options),
  };

  try {
    workspace = await registerWorkspace(
      browserApi,
      `+7996${String(Date.now()).slice(-7)}`,
      `DASH-${marker}`,
    );
    await markOnboardingCompleted(workspace);
    await unlockPortal(page);

    const meResponsePromise = page.waitForResponse((response) => (
      response.url() === `${apiBase}/me` && response.request().method() === 'GET'
    ));
    await page.goto('/dashboard');
    const meResponse = await meResponsePromise;
    expect(meResponse.ok()).toBe(true);
    await expectDashboardReady(page);
    await expect(page.getByRole('region', { name: 'Настраиваемая доска' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Моя доска' })).toBeVisible();

    const sessionCookie = (await context.cookies(backendOrigin)).find((cookie) => cookie.name === 'bs_session');
    expect(sessionCookie, 'dashboard must use the backend HttpOnly session').toBeTruthy();
    expect(sessionCookie.httpOnly).toBe(true);

    const widgetMenuTrigger = page.getByRole('button', { name: /Действия с блоком/ }).first();
    await expect(widgetMenuTrigger).toBeVisible();
    await widgetMenuTrigger.focus();
    await page.keyboard.press('ArrowDown');

    const refreshMenuItem = page.getByRole('menuitem', { name: 'Обновить данные' });
    await expect(refreshMenuItem).toBeVisible();
    await expect(refreshMenuItem).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(widgetMenuTrigger).toBeFocused();

    const addBlock = page.getByRole('button', { name: /Добавить блок/ });
    await addBlock.click();
    await expect(page.getByText('Настройка доски', { exact: true })).toBeVisible();
    await expect(page.locator('.dashboard-workspace__catalog-grid input[type="checkbox"]').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByText('Настройка доски', { exact: true })).toHaveCount(0);
    const blocksButton = page.getByRole('button', { name: /Блоки/ });
    await expect(blocksButton).toBeFocused();
    await expect(page.getByRole('button', { name: 'Готово' })).toBeVisible();

    await page.getByRole('button', { name: 'Готово' }).click();
    await expect(page.getByRole('button', { name: 'Настроить доску' })).toBeVisible();

    await page.setViewportSize({ width: 480, height: 900 });
    await page.reload();
    await expectDashboardReady(page);
    await expect(page.getByRole('heading', { name: 'Моя доска' })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    const mobileTrigger = page.getByRole('button', { name: /Действия с блоком/ }).first();
    await expect(mobileTrigger).toBeVisible();
    const triggerBox = await mobileTrigger.boundingBox();
    expect(triggerBox).toBeTruthy();
    expect(triggerBox.width).toBeGreaterThanOrEqual(39);
    expect(triggerBox.height).toBeGreaterThanOrEqual(39);

    const dashboardItems = page.locator('.dashboard-grid__item');
    const itemCount = await dashboardItems.count();
    expect(itemCount).toBeGreaterThan(0);
    for (let index = 0; index < Math.min(itemCount, 6); index += 1) {
      const box = await dashboardItems.nth(index).boundingBox();
      expect(box).toBeTruthy();
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(481);
    }
  } finally {
    await cleanupWorkspace(workspace);
  }
});
