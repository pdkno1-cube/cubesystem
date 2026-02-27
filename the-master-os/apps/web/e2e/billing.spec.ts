import { test, expect } from '@playwright/test';

test.describe('Billing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders billing page', async ({ page }) => {
    await expect(page).toHaveURL(/\/billing/);
  });

  test('billing heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '크레딧 / 과금' })).toBeVisible({ timeout: 10_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });
});
