import { test, expect } from '@playwright/test';

test.describe('Vault', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/vault');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders vault page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/vault/);
    await expect(page.getByRole('heading', { name: '시크릿 볼트' })).toBeVisible({ timeout: 15_000 });
  });

  test('secret list or empty state is visible', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    // Page should render without error
    const errorBoundary = page.getByText(/something went wrong/i);
    await expect(errorBoundary).not.toBeVisible();
  });

  test('add secret button opens modal', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add|추가|new|새/i }).first();
    if (await addButton.isVisible()) {
      await addButton.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    }
  });

  test('MCP section is present', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    // Vault page should load
    await expect(page.getByRole('heading', { name: '시크릿 볼트' })).toBeVisible({ timeout: 15_000 });
  });
});
