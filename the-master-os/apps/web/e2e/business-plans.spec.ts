import { test, expect } from '@playwright/test';

test.describe('Business Plans (사업계획서)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/business-plans');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders business plans page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/business-plans/);
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });

  test('new plan button is visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });

    const newPlanButton = page.getByRole('button', { name: /새 사업계획서/ });
    await expect(newPlanButton).toBeVisible();
  });

  test('summary stat cards are visible (3 cards)', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('전체').first()).toBeVisible();
    await expect(page.getByText('완료').first()).toBeVisible();
    await expect(page.getByText('생성 중').first()).toBeVisible();
  });

  test('wizard opens when clicking new plan button', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /새 사업계획서/ }).click();

    // Wizard dialog should appear
    const wizardHeading = page.getByRole('heading', { name: '새 사업계획서 만들기' });
    await expect(wizardHeading).toBeVisible({ timeout: 5_000 });

    // Step 1 fields should be visible
    await expect(page.getByText('기본 정보')).toBeVisible();
    await expect(page.getByText('회사명')).toBeVisible();
    await expect(page.getByText('산업 분류')).toBeVisible();
    await expect(page.getByText('타겟 시장')).toBeVisible();
  });

  test('wizard closes on X button', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /새 사업계획서/ }).click();

    const wizardHeading = page.getByRole('heading', { name: '새 사업계획서 만들기' });
    await expect(wizardHeading).toBeVisible({ timeout: 5_000 });

    // Close via X button (aria-label or close button)
    const closeButton = page.locator('button').filter({ has: page.locator('svg.lucide-x') }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await expect(wizardHeading).not.toBeVisible({ timeout: 5_000 });
  });

  test('wizard has 4 step indicators', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /새 사업계획서/ }).click();

    const wizardHeading = page.getByRole('heading', { name: '새 사업계획서 만들기' });
    await expect(wizardHeading).toBeVisible({ timeout: 5_000 });

    // Verify all 4 step labels are present
    const stepLabels = ['기본 정보', '회사 설명', '시장 규모', '경쟁사'];
    for (const label of stepLabels) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('wizard next button is disabled without required fields', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /새 사업계획서/ }).click();

    const wizardHeading = page.getByRole('heading', { name: '새 사업계획서 만들기' });
    await expect(wizardHeading).toBeVisible({ timeout: 5_000 });

    // "다음" button should be disabled when fields are empty
    const nextButton = page.getByRole('button', { name: '다음' });
    await expect(nextButton).toBeVisible();
    await expect(nextButton).toHaveClass(/cursor-not-allowed|bg-gray-200/);
  });

  test('empty state or plan cards are displayed', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '사업계획서' }),
    ).toBeVisible({ timeout: 15_000 });

    const emptyMessage = page.getByText('아직 사업계획서가 없습니다');
    const planCard = page.locator('[class*="rounded-xl"]').filter({ hasText: /상세 보기/ }).first();

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasCards = await planCard.isVisible().catch(() => false);

    expect(hasEmpty || hasCards).toBeTruthy();
  });
});
