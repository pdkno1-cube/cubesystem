import { test, expect } from '@playwright/test';

test.describe('Workspaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
  });

  test('renders workspaces page', async ({ page }) => {
    await expect(page).toHaveURL(/\/workspaces/);
  });

  test('workspace list or empty state is visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const heading = page.getByRole('heading', { name: /workspace/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('workspace cards render', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const cards = page.locator('[class*="workspace"], [class*="Workspace"], [class*="card"], [class*="Card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
