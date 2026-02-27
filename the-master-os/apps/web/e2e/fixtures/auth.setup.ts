import { test as setup } from '@playwright/test';
import * as path from 'path';

const authFile = path.join(process.cwd(), 'playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  await page.fill('#email', process.env['E2E_EMAIL'] ?? 'cube@cubesystem.co.kr');
  await page.fill('#password', process.env['E2E_PASSWORD'] ?? 'cube1234!!');
  await page.click('button:has-text("Sign In")');

  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
