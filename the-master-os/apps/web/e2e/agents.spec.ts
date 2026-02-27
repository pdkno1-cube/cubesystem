import { test, expect } from '@playwright/test';

test.describe('Agents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders agents page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByRole('heading', { name: '에이전트 풀' })).toBeVisible();
  });

  test('agent cards are visible', async ({ page }) => {
    // Agent cards with h3 headings for each agent name
    const agentCards = page.locator('h3').first();
    await expect(agentCards).toBeVisible({ timeout: 10_000 });
  });
});
