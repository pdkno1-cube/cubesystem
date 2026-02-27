import { test, expect } from '@playwright/test';

test.describe('Debates (다중 페르소나 토론)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/debates');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders debates page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/debates/);
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });

  test('new debate button is visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });

    const newDebateButton = page.getByRole('button', { name: /새 토론/ });
    await expect(newDebateButton).toBeVisible();
  });

  test('create debate dialog opens and closes', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /새 토론/ }).click();

    // Dialog should appear with heading "새 토론 시작"
    const dialogHeading = page.getByRole('heading', { name: '새 토론 시작' });
    await expect(dialogHeading).toBeVisible({ timeout: 5_000 });

    // Dialog should have topic input and agent selection
    await expect(page.locator('#debate-topic')).toBeVisible();
    await expect(page.getByText('참여 에이전트 선택')).toBeVisible();

    // Close the dialog
    await page.getByRole('button', { name: '취소' }).click();
    await expect(dialogHeading).not.toBeVisible({ timeout: 5_000 });
  });

  test('status filter tabs are rendered (전체/진행중/완료)', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });

    const expectedTabs = ['전체', '진행중', '완료'];
    for (const label of expectedTabs) {
      await expect(
        page.getByRole('button', { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('clicking status filter tab highlights it', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });

    const completedTab = page.getByRole('button', { name: '완료', exact: true }).first();
    await completedTab.click();

    await expect(completedTab).toHaveClass(/bg-white|text-gray-900|shadow/);
  });

  test('search input is present', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });

    const searchInput = page.getByPlaceholder('토론 주제 검색...');
    await expect(searchInput).toBeVisible();
  });

  test('empty state or debate cards are displayed', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });

    const emptyMessage = page.getByText('아직 토론이 없습니다');
    const debateCard = page.locator('[role="button"]').filter({ hasText: /개 메시지/ }).first();

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasCards = await debateCard.isVisible().catch(() => false);

    expect(hasEmpty || hasCards).toBeTruthy();
  });

  test('empty state shows start button when no debates', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '다중 페르소나 토론' }),
    ).toBeVisible({ timeout: 15_000 });

    const emptyMessage = page.getByText('아직 토론이 없습니다');
    if (await emptyMessage.isVisible().catch(() => false)) {
      const startButton = page.getByRole('button', { name: '첫 토론 시작하기' });
      await expect(startButton).toBeVisible();
    }
  });
});
