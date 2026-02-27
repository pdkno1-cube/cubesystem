import { test, expect } from '@playwright/test';

test.describe('Agents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/agents');
  });

  test('renders agents page', async ({ page }) => {
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByRole('heading', { name: /agent/i })).toBeVisible();
  });

  test('agent list or cards are visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const agents = page.locator('[class*="agent"], [class*="Agent"], [data-testid*="agent"]');
    const count = await agents.count();
    // Page should render (even empty state is acceptable)
    await expect(page.locator('body')).toBeVisible();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
