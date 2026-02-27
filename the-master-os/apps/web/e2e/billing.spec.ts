import { test, expect } from '@playwright/test';

test.describe('Billing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/billing');
  });

  test('renders billing page', async ({ page }) => {
    await expect(page).toHaveURL(/\/billing/);
  });

  test('credit information is visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const heading = page.getByRole('heading', { name: /billing|credit|크레딧/i });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('page loads without error', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // No error boundary message
    const errorText = page.getByText(/something went wrong|error|오류/i);
    await expect(errorText).not.toBeVisible();
  });
});
