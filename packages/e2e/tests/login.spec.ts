import { expect, test } from '@playwright/test';

import { E2E_USER } from '../setup/env.ts';

// ログイン自体を確かめたいので、保存済みセッションを捨てて未ログインで始める。
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('ログイン', () => {
  test('未ログインで保護されたページを開くとログイン画面に飛ばされる', async ({ page }) => {
    await page.goto('/users');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
  });

  test('正しい資格情報でログインすると一覧に入れる', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(E2E_USER.email);
    await page.getByLabel('パスワード').fill(E2E_USER.password);
    await page.getByRole('button', { name: 'ログイン' }).click();

    // ログイン後の着地点はアプリトップ。
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /さん/ })).toBeVisible();
  });

  test('パスワードが違うとエラーが出て、画面に留まる', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(E2E_USER.email);
    await page.getByLabel('パスワード').fill('wrong-password');
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(page.getByRole('alert')).toHaveText('email or password is incorrect');
    await expect(page).toHaveURL(/\/login/);
  });

  test('ログアウトするとセッションが切れ、戻っても入れない', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(E2E_USER.email);
    await page.getByLabel('パスワード').fill(E2E_USER.password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await expect(page.getByRole('heading', { name: /さん/ })).toBeVisible();

    // サインアウトは右上のユーザーメニューから。
    await page.getByRole('button', { name: /E2E Admin/ }).click();
    await page.getByRole('menuitem', { name: 'サインアウト' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/users');
    await expect(page).toHaveURL(/\/login/);
  });
});
