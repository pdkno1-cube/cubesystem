import { test as setup } from '@playwright/test';
import * as path from 'path';

const authFile = path.join(process.cwd(), 'playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Allow extra time for first-compile in dev mode
  setup.setTimeout(90_000);

  await page.goto('/login', { waitUntil: 'networkidle' });

  // Wait for form to be fully hydrated
  await page.waitForSelector('#email', { state: 'visible', timeout: 60_000 });

  await page.fill('#email', process.env['E2E_EMAIL'] ?? 'cube@cubesystem.co.kr');
  await page.fill('#password', process.env['E2E_PASSWORD'] ?? 'cube1234!!');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  await page.context().storageState({ path: authFile });
});
