import { test, expect } from '@playwright/test';

test.describe('icore client-mui smoke', () => {
  test('landing renders iCore version heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('icore v');
    await expect(page.getByText('mui')).toBeVisible();
  });

  test('login route renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('protected route redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/_dashboard/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('profile route redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/_dashboard/profile');
    await expect(page).toHaveURL(/\/login$/);
  });
});
