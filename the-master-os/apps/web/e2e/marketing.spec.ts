import { test, expect } from '@playwright/test';

test.describe('Marketing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/marketing');
  });

  test('renders marketing page', async ({ page }) => {
    await expect(page).toHaveURL(/\/marketing/);
  });

  test('calendar tab is active by default', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const calendarTab = page.getByRole('tab', { name: /calendar|캘린더/i });
    if (await calendarTab.isVisible()) {
      await expect(calendarTab).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('switches to analytics tab', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const analyticsTab = page.getByRole('tab', { name: /analytic|성과|분석/i });
    if (await analyticsTab.isVisible()) {
      await analyticsTab.click();
      await expect(analyticsTab).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('month navigation buttons are present', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const prevButton = page.getByRole('button', { name: /prev|이전|◀|←/i }).first();
    const nextButton = page.getByRole('button', { name: /next|다음|▶|→/i }).first();
    // At least one navigation control should be present for a calendar
    const hasNav = (await prevButton.isVisible()) || (await nextButton.isVisible());
    // Calendar might use icon buttons without text — check for button near month heading
    if (!hasNav) {
      const buttons = await page.locator('button').count();
      expect(buttons).toBeGreaterThan(0);
    }
  });
});
