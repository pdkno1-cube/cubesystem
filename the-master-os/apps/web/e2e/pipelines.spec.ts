import { test, expect } from '@playwright/test';

test.describe('Pipelines', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pipelines');
  });

  test('renders pipeline list page', async ({ page }) => {
    await expect(page).toHaveURL(/\/pipelines/);
    await expect(page.getByRole('heading', { name: /pipeline/i })).toBeVisible();
  });

  test('pipeline cards are visible', async ({ page }) => {
    // Wait for content to load
    await page.waitForLoadState('networkidle');
    const cards = page.locator('[class*="card"], [class*="Card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('run button opens start dialog', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const runButton = page.getByRole('button', { name: /run|실행|start/i }).first();
    if (await runButton.isVisible()) {
      await runButton.click();
      // Dialog/modal should appear
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Cancel/close the dialog
      const cancelButton = page.getByRole('button', { name: /cancel|취소|close|닫기/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
