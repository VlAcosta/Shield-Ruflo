const { test, expect } = require('@playwright/test');

test.use({ javaScriptEnabled: false });

test('static fallback is useful when a visitor does not execute JavaScript', async ({ page }) => {
  await page.goto('/');

  const fallback = page.locator('[data-static-fallback="true"]');
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole('heading', { name: 'Business Shield' })).toBeVisible();
  await expect(fallback).toContainText('Платформа для управления отзывами');
  await expect(fallback.getByRole('link', { name: 'Вход' })).toHaveAttribute('href', '/login');
  await expect(fallback.getByRole('link', { name: 'Регистрация' })).toHaveAttribute('href', '/register');
  await expect(fallback.getByRole('link', { name: 'Статус API' })).toHaveAttribute('href', '/api/v1/meta');

  await expect(page.locator('body')).not.toContainText('включить JavaScript');
  await expect(page.locator('body')).not.toContainText('enable JavaScript');
});

test('SPA routes keep the same static fallback without JavaScript', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('[data-static-fallback="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Business Shield' })).toBeVisible();
});
