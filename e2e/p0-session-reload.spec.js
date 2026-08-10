const { test, expect, request } = require('@playwright/test');
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
    data: { phone, code: challenge.debug_code || fixedOtp, session_id: challenge.session_id, mode: 'register' },
  }), 'verify OTP');

  const profileResponse = await expectOk(await api.post(`${apiBase}/auth/complete-profile`, {
    data: { phone, first_name: firstName, last_name: 'E2E', email: '' },
  }), 'complete profile');
  const profile = await profileResponse.json();
  const organizationId = profile.user.membership.organizationId;

  const contextResponse = await expectOk(await api.get(`${apiBase}/organizations/current`), 'load organization');
  const organization = (await contextResponse.json()).context;
  return {
    userId: profile.user.id,
    organizationId,
    organizationName: profile.user.membership.organization.name,
    businessId: organization.businesses[0].id,
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

async function cleanupWorkspaces(workspaces) {
  const ids = workspaces.filter(Boolean);
  if (!ids.length) return;
  const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    await pool.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [ids.map((item) => item.organizationId)]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids.map((item) => item.userId)]);
  } finally {
    await pool.end();
  }
}

async function importReview(api, workspace, marker) {
  const sourceResponse = await expectOk(await api.post(`${apiBase}/review-sources`, {
    data: {
      businessId: workspace.businessId,
      provider: 'e2e-provider',
      name: `E2E source ${marker}`,
      status: 'ACTIVE',
    },
  }), 'create review source');
  const source = (await sourceResponse.json()).source;

  await expectOk(await api.post(`${apiBase}/reviews/import`, {
    data: {
      sourceId: source.id,
      businessId: workspace.businessId,
      externalId: `review-${marker}`,
      rating: 1,
      text: `Real PostgreSQL review ${marker}`,
      author: { name: `Author ${marker}` },
      publishedAt: '2024-01-01T10:00:00.000Z',
    },
  }), 'import review');
}

test('F5 restores the HttpOnly session, backend organization and PostgreSQL Reviews Inbox', async ({ page, context }) => {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const aMarker = `ORG-A-${marker}`;
  const bMarker = `ORG-B-${marker}`;

  let workspaceA;
  let workspaceB;
  await page.addInitScript((configuredApiBase) => {
    window.__BUSINESS_SHIELD_ENV__ = { API_BASE: configuredApiBase };
  }, apiBase);
  await page.goto('/');
  const browserApi = {
    post: (url, options) => page.request.post(url, options),
    get: (url, options) => page.request.get(url, options),
  };
  workspaceA = await registerWorkspace(browserApi, `+7998${String(Date.now()).slice(-7)}`, aMarker);
  // The P0 test exercises authenticated Reviews/F5 restoration, not onboarding itself.
  // Complete onboarding as fixture state so the real route guard admits /reviews.
  await markOnboardingCompleted(workspaceA);
  await importReview(browserApi, workspaceA, aMarker);
  await page.evaluate(() => {
    localStorage.setItem('portal_pin_code', '7391');
    localStorage.setItem('portal_pin_unlocked', '1');
  });

  const isolatedApi = await request.newContext();
  try {
    workspaceB = await registerWorkspace(isolatedApi, `+7997${String(Date.now() + 1).slice(-7)}`, bMarker);
    await importReview(isolatedApi, workspaceB, bMarker);

    await page.goto('/reviews?queue=inbox');
    await expect(page.getByText(`Author ${aMarker}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Real PostgreSQL review ${aMarker}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Author ${bMarker}`, { exact: true })).toHaveCount(0);

    const cookies = await context.cookies(backendOrigin);
    const sessionCookie = cookies.find((cookie) => cookie.name === 'bs_session');
    expect(sessionCookie, 'backend must establish the browser session cookie').toBeTruthy();
    expect(sessionCookie.httpOnly).toBe(true);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBeNull();

    await page.evaluate(({ workspaceB, bMarker }) => {
      localStorage.clear();
      localStorage.setItem('token', 'forged-local-token');
      localStorage.setItem('currentUser', JSON.stringify({
        id: 'forged-user-b',
        membership: {
          organizationId: workspaceB.organizationId,
          organization: { id: workspaceB.organizationId, name: workspaceB.organizationName },
        },
      }));
      localStorage.setItem('business-shield:company-membership:v1', JSON.stringify({
        organizationId: workspaceB.organizationId,
      }));
      localStorage.setItem('business-shield:reviews:v1', JSON.stringify([{
        id: 'forged-review-b', author: `Author ${bMarker}`, text: `Fake local review ${bMarker}`,
      }]));
      localStorage.setItem('portal_pin_code', '7391');
      localStorage.setItem('portal_pin_unlocked', '1');
      // Deliberately leave onboarding_completed absent: /me, not cached state,
      // must restore the authoritative membership before the route is admitted.
    }, { workspaceB, bMarker });

    const meResponsePromise = page.waitForResponse((response) => response.url() === `${apiBase}/me` && response.request().method() === 'GET');
    const reviewsResponsePromise = page.waitForResponse((response) => response.url().startsWith(`${apiBase}/reviews?`) && response.request().method() === 'GET');
    await page.reload();
    const [meResponse, reviewsResponse] = await Promise.all([meResponsePromise, reviewsResponsePromise]);
    expect(meResponse.ok()).toBe(true);
    expect(reviewsResponse.ok()).toBe(true);

    const me = await meResponse.json();
    const reviews = await reviewsResponse.json();
    expect(me.organizationContext.organizationId).toBe(workspaceA.organizationId);
    expect(me.user.membership.organization.id).toBe(workspaceA.organizationId);
    expect(me.user.membership.organization.name).toBe(workspaceA.organizationName);
    expect(reviews.items.some((item) => item.author?.name === `Author ${aMarker}` || item.author === `Author ${aMarker}`)).toBe(true);
    expect(reviews.items.some((item) => item.author?.name === `Author ${bMarker}` || item.author === `Author ${bMarker}`)).toBe(false);

    await expect(page).toHaveURL(/\/reviews/);
    await expect(page.getByText(`Author ${aMarker}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Real PostgreSQL review ${aMarker}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Author ${bMarker}`, { exact: true })).toHaveCount(0);
    await expect(page.getByText(`Fake local review ${bMarker}`, { exact: true })).toHaveCount(0);

    const restoredClientState = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      user: JSON.parse(localStorage.getItem('currentUser') || 'null'),
      onboarding: localStorage.getItem('onboarding_completed'),
    }));
    expect(restoredClientState.token).toBeNull();
    expect(restoredClientState.user.membership.organizationId).toBe(workspaceA.organizationId);
    expect(restoredClientState.onboarding).toBe('1');
  } finally {
    await isolatedApi.dispose();
    await cleanupWorkspaces([workspaceA, workspaceB]);
  }
});
