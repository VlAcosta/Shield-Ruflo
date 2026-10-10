const { test, expect } = require('@playwright/test');

test.describe('static HTML fallback', () => {
  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('renders meaningful product content for non-JS visitors and tools', async ({ page }) => {
      await page.goto('/');

      const fallback = page.locator('[data-static-fallback="true"]');
      await expect(fallback).toBeVisible();
      await expect(fallback.getByRole('heading', { name: /Отзывы, ответы, задачи и отчёты/i })).toBeVisible();
      await expect(fallback).toContainText('Business Shield помогает собирать обратную связь');
      await expect(fallback).toContainText('Единый inbox отзывов');
      await expect(fallback).toContainText('Как устроен процесс');
      await expect(fallback).toContainText('START');
      await expect(fallback).toContainText('BUSINESS');
      await expect(fallback.getByRole('link', { name: 'Вход' })).toHaveAttribute('href', '/login');
      await expect(fallback.getByRole('link', { name: 'Регистрация' })).toHaveAttribute('href', '/register');
      await expect(fallback.getByRole('link', { name: 'Проверить статус API' })).toHaveAttribute('href', '/api/v1/meta');

      await expect(page.locator('body')).not.toContainText('включить JavaScript');
      await expect(page.locator('body')).not.toContainText('enable JavaScript');
    });

    test('SPA routes still expose the static product shell without JavaScript', async ({ page }) => {
      await page.goto('/login');

      const fallback = page.locator('[data-static-fallback="true"]');
      await expect(fallback).toBeVisible();
      await expect(fallback).toContainText('Отзывы, ответы, задачи и отчёты');
      await expect(fallback.getByRole('link', { name: 'Вход' })).toHaveAttribute('href', '/login');
    });
  });

  test('React boot removes the static shell for normal JavaScript visitors', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-static-fallback="true"]')).toHaveCount(0);
    await expect(page.locator('#root')).not.toBeEmpty();
  });
});
