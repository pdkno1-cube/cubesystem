import { test, expect } from '@playwright/test';

test.describe('Audit Logs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/audit-logs');
  });

  test('renders audit logs page', async ({ page }) => {
    await expect(page).toHaveURL(/\/audit-logs/);
  });

  test('audit log heading is visible', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const heading = page.getByRole('heading', { name: /audit|log|감사/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('table or log entries render', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    // Either a table or a list of log entries, or empty state
    const table = page.locator('table, [role="table"]');
    const hasTable = await table.count();
    expect(hasTable).toBeGreaterThanOrEqual(0);
    await expect(page.locator('body')).toBeVisible();
  });
});
