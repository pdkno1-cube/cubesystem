import { test, expect } from '@playwright/test';

test.describe('Grants (조달입찰)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/grants');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders grants page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/grants/);
    await expect(
      page.getByRole('heading', { name: '조달입찰' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });

  test('KPI cards section is visible (3 cards)', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '조달입찰' }),
    ).toBeVisible({ timeout: 15_000 });

    // Three KPI cards: 활성 공고, 진행중 입찰, 낙찰률
    await expect(page.getByText('활성 공고')).toBeVisible();
    await expect(page.getByText('진행중 입찰')).toBeVisible();
    await expect(page.getByText('낙찰률')).toBeVisible();
  });

  test('status filter tabs are rendered', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '조달입찰' }),
    ).toBeVisible({ timeout: 15_000 });

    const expectedTabs = ['전체', '탐색중', '검증중', '검토중', '서류준비', '제출완료', '낙찰'];
    for (const label of expectedTabs) {
      await expect(
        page.getByRole('button', { name: label }).first(),
      ).toBeVisible();
    }
  });

  test('clicking a status filter tab updates the active tab', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '조달입찰' }),
    ).toBeVisible({ timeout: 15_000 });

    const tabButton = page.getByRole('button', { name: '탐색중' }).first();
    await tabButton.click();

    // The clicked tab should have the active style (border-brand-600)
    await expect(tabButton).toHaveClass(/border-brand-600|text-brand-600/);
  });

  test('search input is present', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '조달입찰' }),
    ).toBeVisible({ timeout: 15_000 });

    const searchInput = page.getByPlaceholder('공고명, 기관명, 공고번호로 검색...');
    await expect(searchInput).toBeVisible();
  });

  test('empty state message is shown when no tenders', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '조달입찰' }),
    ).toBeVisible({ timeout: 15_000 });

    // With no data, empty state or table should be present
    const emptyMessage = page.getByText('수집된 공고가 없습니다');
    const table = page.locator('table');

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasTable = await table.isVisible().catch(() => false);

    // One of them should be visible
    expect(hasEmpty || hasTable).toBeTruthy();
  });

  test('crawl button is present', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '조달입찰' }),
    ).toBeVisible({ timeout: 15_000 });

    const crawlButton = page.getByRole('button', { name: /공고 수집/ });
    await expect(crawlButton).toBeVisible();
  });
});
