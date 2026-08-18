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

async function readDashboardState(page, diagnostics = {}) {
  const browserState = await page.evaluate(() => {
    const portal = document.querySelector('.portal');
    const workspace = document.querySelector('#dashboard-workspace');
    return {
      pathname: window.location.pathname,
      workspaceMounted: Boolean(workspace),
      portalLocked: portal ? portal.classList.contains('portal--locked') : null,
      workspaceAriaHidden: workspace?.closest('.portal__contentWrap')?.getAttribute('aria-hidden') || null,
      screen: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 500),
      rootHtml: document.getElementById('root')?.innerHTML?.replace(/\s+/g, ' ').trim().slice(0, 500) || '',
    };
  });
  return {
    ...browserState,
    pageErrors: diagnostics.pageErrors?.slice(-5) || [],
    consoleErrors: diagnostics.consoleErrors?.slice(-5) || [],
  };
}

async function expectDashboardReady(page, diagnostics) {
  let latest = await readDashboardState(page, diagnostics);
  try {
    await expect.poll(async () => {
      latest = await readDashboardState(page, diagnostics);
      return latest.pathname === '/dashboard'
        && latest.workspaceMounted
        && latest.portalLocked === false
        && latest.workspaceAriaHidden === null;
    }, { timeout: 30_000 }).toBe(true);
  } catch {
    throw new Error(`Dashboard readiness failed: ${JSON.stringify(latest)}`);
  }
}

async function assertNoHorizontalOverflow(page) {
  const report = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const root = document.documentElement.scrollWidth;
    const body = document.body.scrollWidth;
    const overflow = Math.max(0, root - viewport, body - viewport);
    const round = (value) => Math.round(value * 10) / 10;
    const describe = (node) => {
      const className = typeof node.className === 'string'
        ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 5).join('.')
        : '';
      return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${className ? `.${className}` : ''}`;
    };

    const visibleNodes = Array.from(document.body.querySelectorAll('*')).filter((node) => {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const offenders = visibleNodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const rightOverflow = Math.max(0, rect.right - viewport);
        const leftOverflow = Math.max(0, -rect.left);
        return {
          selector: describe(node),
          left: round(rect.left),
          right: round(rect.right),
          width: round(rect.width),
          rightOverflow: round(rightOverflow),
          leftOverflow: round(leftOverflow),
          position: style.position,
          transform: style.transform === 'none' ? null : style.transform,
          overflowX: style.overflowX,
          text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        };
      })
      .filter((item) => item.rightOverflow > 1 || item.leftOverflow > 1)
      .sort((a, b) => Math.max(b.rightOverflow, b.leftOverflow) - Math.max(a.rightOverflow, a.leftOverflow))
      .slice(0, 20);

    const wideContainers = visibleNodes
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => ({
        selector: describe(node),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        delta: node.scrollWidth - node.clientWidth,
      }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 15);

    const gridItemPseudo = Array.from(document.querySelectorAll('.dashboard-grid__item')).slice(0, 6).map((node) => {
      const before = getComputedStyle(node, '::before');
      const after = getComputedStyle(node, '::after');
      return {
        selector: describe(node),
        before: {
          content: before.content,
          position: before.position,
          inset: before.inset,
          top: before.top,
          right: before.right,
          bottom: before.bottom,
          left: before.left,
          width: before.width,
          transform: before.transform,
        },
        after: {
          content: after.content,
          position: after.position,
          inset: after.inset,
          right: after.right,
          left: after.left,
          width: after.width,
          transform: after.transform,
        },
      };
    });

    return { viewport, root, body, overflow, offenders, wideContainers, gridItemPseudo };
  });

  expect(report.viewport).toBe(480);
  if (report.overflow > 1) {
    throw new Error(`Horizontal overflow detected: ${JSON.stringify(report)}`);
  }
}

test('Dashboard supports keyboard actions, catalog Escape flow and 480px mobile layout', async ({ page, context }) => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let workspace;
  const diagnostics = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error?.stack || error?.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });

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
    await expectDashboardReady(page, diagnostics);
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
    await expectDashboardReady(page, diagnostics);
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
