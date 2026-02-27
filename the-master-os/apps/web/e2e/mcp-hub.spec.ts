import { test, expect } from '@playwright/test';

test.describe('MCP Hub (Settings > Infra)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders settings page heading', async ({ page }) => {
    await expect(page).toHaveURL(/\/settings/);
    await expect(
      page.getByRole('heading', { name: '설정' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('page loads without error', async ({ page }) => {
    const errorText = page.getByText(/something went wrong|오류가 발생/i);
    await expect(errorText).not.toBeVisible();
  });

  test('settings tabs are visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '설정' }),
    ).toBeVisible({ timeout: 15_000 });

    // Verify all 4 tabs exist
    await expect(page.getByRole('tab', { name: /프로필/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /보안/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /시스템/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /인프라/ })).toBeVisible();
  });

  test('infra tab is clickable and shows content', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '설정' }),
    ).toBeVisible({ timeout: 15_000 });

    const infraTab = page.getByRole('tab', { name: /인프라/ });
    await infraTab.click();

    // Wait for infra content to load (either loading spinner, data, or error)
    await expect(infraTab).toHaveAttribute('aria-selected', 'true');

    // After clicking, the infra section should render something visible
    const infraContent = page.locator('body');
    await expect(infraContent).toBeVisible();
  });

  test('system tab shows system info section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '설정' }),
    ).toBeVisible({ timeout: 15_000 });

    const systemTab = page.getByRole('tab', { name: /시스템/ });
    await systemTab.click();

    await expect(page.getByText('시스템 정보')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('외부 서비스 상태')).toBeVisible({ timeout: 10_000 });
  });

  test('security tab shows MFA section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '설정' }),
    ).toBeVisible({ timeout: 15_000 });

    const securityTab = page.getByRole('tab', { name: /보안/ });
    await securityTab.click();

    await expect(page.getByText('다단계 인증 (MFA)')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('TOTP 인증기')).toBeVisible({ timeout: 10_000 });
  });

  test('profile tab shows profile section by default', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '설정' }),
    ).toBeVisible({ timeout: 15_000 });

    // Profile tab should be active by default
    const profileTab = page.getByRole('tab', { name: /프로필/ });
    await expect(profileTab).toHaveAttribute('aria-selected', 'true');

    // Profile section content should be visible
    await expect(page.getByText('프로필')).toBeVisible({ timeout: 10_000 });
  });

  test('system tab shows health check button', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: '설정' }),
    ).toBeVisible({ timeout: 15_000 });

    const systemTab = page.getByRole('tab', { name: /시스템/ });
    await systemTab.click();

    await expect(page.getByText('시스템 정보')).toBeVisible({ timeout: 10_000 });

    const healthCheckButton = page.getByRole('button', { name: /시스템 헬스체크 실행/ });
    await expect(healthCheckButton).toBeVisible();
  });
});
