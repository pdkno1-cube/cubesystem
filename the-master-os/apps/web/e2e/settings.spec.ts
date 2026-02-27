import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('renders settings page', async ({ page }) => {
    await expect(page).toHaveURL(/\/settings/);
  });

  test('settings heading is visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const heading = page.getByRole('heading', { name: /setting|설정/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('page loads without error', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const errorText = page.getByText(/something went wrong|오류/i);
    await expect(errorText).not.toBeVisible();
  });
});
