import { test, expect } from '@playwright/test';

test.describe('Pipelines', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pipelines');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders pipelines page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/pipelines/);
    await expect(page.getByRole('heading', { name: '파이프라인' })).toBeVisible();
  });

  test('pipeline cards are visible', async ({ page }) => {
    const cards = page.locator('[class*="card"], [class*="Card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('run button opens start dialog', async ({ page }) => {
    const runButton = page.getByRole('button', { name: /run|실행|start/i }).first();
    if (await runButton.isVisible()) {
      await runButton.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
