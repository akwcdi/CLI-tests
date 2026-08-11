import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

import { BASE_URL, STORAGE_STATE } from './playwright.config.ts';

const TEST_USER = {
  email: process.env.E2E_USER_EMAIL ?? 'e2e@example.com',
  password: process.env.E2E_USER_PASSWORD ?? 'password',
};

/**
 * テストユーザーで1回だけログインし、セッションを {@link STORAGE_STATE} に保存する。
 * 各テストは playwright.config.ts の `use.storageState` 経由でこれを読み込むため、
 * テストごとにログインし直す必要がない。
 *
 * セレクタはこのプロジェクトのログイン画面に合わせて調整すること。
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await mkdir(dirname(STORAGE_STATE), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: BASE_URL });

    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(TEST_USER.email);
    await page.getByLabel('パスワード').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'ログイン' }).click();

    // ログイン完了の確定待ち。ここが緩いと後続テストが不安定になる。
    await page.waitForURL('**/dashboard');

    await page.context().storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
