import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders settings page', async ({ page }) => {
    await expect(page).toHaveURL(/\/settings/);
  });

  test('settings heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '설정' })).toBeVisible({ timeout: 10_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });
});
