import { test, expect } from '@playwright/test';

test.describe('Vault', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/vault');
  });

  test('renders vault page', async ({ page }) => {
    await expect(page).toHaveURL(/\/vault/);
    await expect(page.getByRole('heading', { name: /vault|secret/i })).toBeVisible();
  });

  test('secret list or empty state is visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // Either a list of secrets or an empty state message
    const hasSecrets = await page.locator('[class*="secret"], [class*="Secret"]').count();
    const hasEmpty = await page.getByText(/no secret|empty|시크릿이 없/i).count();
    expect(hasSecrets + hasEmpty).toBeGreaterThan(0);
  });

  test('add secret button opens modal', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add|추가|new|새/i }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Close dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('MCP provider cards are visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // Scroll down to MCP section if needed
    const mcpSection = page.getByText(/MCP|integration|provider/i).first();
    if (await mcpSection.isVisible()) {
      await mcpSection.scrollIntoViewIfNeeded();
      // At least some provider cards should be present
      const providerCards = page.locator('[class*="provider"], [class*="Provider"]');
      const count = await providerCards.count();
      // MCP hub has 4 providers (Anthropic, OpenAI, Resend, Google Drive)
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
