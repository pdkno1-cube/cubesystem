import { test, expect } from '@playwright/test';

test.describe('Documents (문서검증)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders documents page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/documents/);
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });

  test('upload button opens dialog', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });

    const uploadButton = page.getByRole('button', { name: /문서 업로드/ });
    await expect(uploadButton).toBeVisible();
    await uploadButton.click();

    // Dialog should appear with heading "문서 업로드"
    const dialogHeading = page.getByRole('heading', { name: '문서 업로드' });
    await expect(dialogHeading).toBeVisible({ timeout: 5_000 });

    // Dialog should have form fields
    await expect(page.locator('#doc-name')).toBeVisible();
    await expect(page.locator('#doc-type')).toBeVisible();
  });

  test('upload dialog closes on cancel', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /문서 업로드/ }).click();

    const dialogHeading = page.getByRole('heading', { name: '문서 업로드' });
    await expect(dialogHeading).toBeVisible({ timeout: 5_000 });

    // Click cancel button
    const cancelButton = page.getByRole('button', { name: '취소' });
    await cancelButton.click();

    // Dialog heading should disappear
    await expect(dialogHeading).not.toBeVisible({ timeout: 5_000 });
  });

  test('status filter tabs are rendered', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });

    const expectedTabs = ['전체', '대기', '검증중', '승인', '반려', '아카이브'];
    for (const label of expectedTabs) {
      await expect(
        page.getByRole('button', { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('clicking a status filter tab highlights it', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });

    const tabButton = page.getByRole('button', { name: '승인', exact: true }).first();
    await tabButton.click();

    // Active tab should have the active style
    await expect(tabButton).toHaveClass(/bg-white|text-gray-900|shadow/);
  });

  test('document table has correct column headers', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });

    const headers = ['파일명', '문서 유형', '상태', '이슈 수', '검증일', '액션'];
    for (const header of headers) {
      await expect(
        page.locator('th').filter({ hasText: header }).first(),
      ).toBeVisible();
    }
  });

  test('KPI cards section is visible (3 cards)', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('총 검증 건')).toBeVisible();
    await expect(page.getByText('승인률')).toBeVisible();
    await expect(page.getByText('이슈 발견 건')).toBeVisible();
  });

  test('empty state is shown or document rows exist', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '문서검증' }),
    ).toBeVisible({ timeout: 15_000 });

    const emptyMessage = page.getByText('아직 검증된 문서가 없습니다.');
    const tableRow = page.locator('tbody tr').first();

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasRows = await tableRow.isVisible().catch(() => false);

    expect(hasEmpty || hasRows).toBeTruthy();
  });
});
