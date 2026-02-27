import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'God Mode Dashboard' })).toBeVisible();
  });

  test('sidebar contains navigation links', async ({ page }) => {
    const navHrefs = [
      '/dashboard',
      '/workspaces',
      '/agents',
      '/pipelines',
      '/marketing',
      '/billing',
      '/vault',
      '/audit-logs',
      '/settings',
    ];
    for (const href of navHrefs) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    }
  });

  test('navigates to pipelines from sidebar', async ({ page }) => {
    await page.locator('a[href="/pipelines"]').first().click();
    await expect(page).toHaveURL(/\/pipelines/);
  });

  test('navigates to agents from sidebar', async ({ page }) => {
    await page.locator('a[href="/agents"]').first().click();
    await expect(page).toHaveURL(/\/agents/);
  });

  test('navigates to vault from sidebar', async ({ page }) => {
    await page.locator('a[href="/vault"]').first().click();
    await expect(page).toHaveURL(/\/vault/);
  });

  test('navigates to marketing from sidebar', async ({ page }) => {
    await page.locator('a[href="/marketing"]').first().click();
    await expect(page).toHaveURL(/\/marketing/);
  });

  test('navigates to workspaces from sidebar', async ({ page }) => {
    await page.locator('a[href="/workspaces"]').first().click();
    await expect(page).toHaveURL(/\/workspaces/);
  });

  test('navigates to billing from sidebar', async ({ page }) => {
    await page.locator('a[href="/billing"]').first().click();
    await expect(page).toHaveURL(/\/billing/);
  });

  test('navigates to settings from sidebar', async ({ page }) => {
    await page.locator('a[href="/settings"]').first().click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('navigates to audit logs from sidebar', async ({ page }) => {
    await page.locator('a[href="/audit-logs"]').first().click();
    await expect(page).toHaveURL(/\/audit-logs/);
  });
});
