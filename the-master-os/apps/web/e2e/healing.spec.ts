import { test, expect } from '@playwright/test';

test.describe('Healing (자동치유)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/healing');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders healing page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/healing/);
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });

  test('KPI cards are visible (4 cards)', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('총 인시던트')).toBeVisible();
    await expect(page.getByText('자동 해결률')).toBeVisible();
    await expect(page.getByText('평균 복구시간')).toBeVisible();
    await expect(page.getByText('활성 인시던트')).toBeVisible();
  });

  test('severity filter buttons are rendered', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });

    // "심각도:" label and filter buttons
    await expect(page.getByText('심각도:')).toBeVisible();

    const severityLabels = ['전체', 'Low', 'Medium', 'High', 'Critical'];
    for (const label of severityLabels) {
      await expect(
        page.getByRole('button', { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('status filter buttons are rendered', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('상태:')).toBeVisible();

    const statusLabels = ['감지됨', '진단중', '치유중', '해결됨', '에스컬레이션'];
    for (const label of statusLabels) {
      await expect(
        page.getByRole('button', { name: label, exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('clicking severity filter updates active state', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });

    const highButton = page.getByRole('button', { name: 'High', exact: true }).first();
    await highButton.click();

    await expect(highButton).toHaveClass(/bg-white|text-gray-900|shadow/);
  });

  test('trigger button opens modal', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });

    const triggerButton = page.getByRole('button', { name: /수동 트리거/ });
    await expect(triggerButton).toBeVisible();
    await triggerButton.click();

    // Modal should appear with heading "수동 치유 트리거"
    const modalHeading = page.getByRole('heading', { name: '수동 치유 트리거' });
    await expect(modalHeading).toBeVisible({ timeout: 5_000 });

    // Modal should have form elements
    await expect(page.getByText('대상 서비스')).toBeVisible();
    await expect(page.getByText('인시던트 유형')).toBeVisible();
  });

  test('trigger modal closes on cancel', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /수동 트리거/ }).click();

    const modalHeading = page.getByRole('heading', { name: '수동 치유 트리거' });
    await expect(modalHeading).toBeVisible({ timeout: 5_000 });

    // Click cancel button
    await page.getByRole('button', { name: '취소' }).click();

    await expect(modalHeading).not.toBeVisible({ timeout: 5_000 });
  });

  test('empty state or incident list is displayed', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '자동치유' }),
    ).toBeVisible({ timeout: 15_000 });

    const emptyMessage = page.getByText('인시던트 없음');
    const incidentButton = page.locator('button').filter({ hasText: /resend|google_drive|slack|firecrawl|supabase|fastapi/i }).first();

    const hasEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasIncidents = await incidentButton.isVisible().catch(() => false);

    expect(hasEmpty || hasIncidents).toBeTruthy();
  });
});
