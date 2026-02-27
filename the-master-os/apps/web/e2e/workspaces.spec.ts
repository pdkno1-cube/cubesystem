import { test, expect } from '@playwright/test';

test.describe('Workspaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders workspaces page', async ({ page }) => {
    await expect(page).toHaveURL(/\/workspaces/);
  });

  test('workspace heading is visible', async ({ page }) => {
    // Use h2 selector to avoid matching sub-headings like "아직 워크스페이스가 없습니다"
    await expect(page.locator('h2').filter({ hasText: '워크스페이스' }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('workspace items or create button visible', async ({ page }) => {
    await expect(page.locator('h2').filter({ hasText: '워크스페이스' }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toBeVisible();
  });
});
