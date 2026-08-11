import { expect, test } from '@playwright/test';

/**
 * global-setup が保存したセッションを使うので、
 * このファイルではログイン手順を書かない。
 */
test.describe('ダッシュボード', () => {
  test('ログイン済みの状態で開ける', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible();
  });

  test('ログイン画面に飛ばされない', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).not.toHaveURL(/\/login/);
  });
});
