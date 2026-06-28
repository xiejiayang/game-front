import { test, expect } from '@playwright/test';

test('页面加载并渲染画布', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/都江堰/);
  await expect(page.locator('#app canvas')).toBeVisible();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
});
