import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('renders KPI cards', async ({ page }) => {
    // At least one stat/KPI card visible
    const cards = page.locator('[data-testid="kpi-card"], .kpi-card, [class*="Card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar contains navigation links', async ({ page }) => {
    const sidebarLinks = [
      /dashboard/i,
      /pipeline/i,
      /agent/i,
      /vault/i,
      /marketing/i,
      /workspace/i,
      /billing/i,
      /setting/i,
      /audit/i,
    ];
    for (const pattern of sidebarLinks) {
      await expect(page.getByRole('link', { name: pattern })).toBeVisible();
    }
  });

  test('navigates to pipelines from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /pipeline/i }).click();
    await expect(page).toHaveURL(/\/pipelines/);
  });

  test('navigates to agents from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /agent/i }).click();
    await expect(page).toHaveURL(/\/agents/);
  });

  test('navigates to vault from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /vault/i }).click();
    await expect(page).toHaveURL(/\/vault/);
  });

  test('navigates to marketing from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /marketing/i }).click();
    await expect(page).toHaveURL(/\/marketing/);
  });

  test('navigates to workspaces from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /workspace/i }).click();
    await expect(page).toHaveURL(/\/workspaces/);
  });

  test('navigates to billing from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /billing/i }).click();
    await expect(page).toHaveURL(/\/billing/);
  });

  test('navigates to settings from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /setting/i }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('navigates to audit logs from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /audit/i }).click();
    await expect(page).toHaveURL(/\/audit-logs/);
  });
});
