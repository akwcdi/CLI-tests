import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

import { STORAGE_STATE } from './playwright.config.ts';
import { BASE_URL, E2E_USER } from './setup/env.ts';

/**
 * シード済みの管理ユーザーで1回だけログインし、
 * セッションを {@link STORAGE_STATE} に保存する。
 *
 * 各テストは playwright.config.ts の `use.storageState` からこれを読むため、
 * テストごとにログインし直さない。ログイン画面そのものの検証は
 * tests/login.spec.ts が storageState を捨てて別途行う。
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await mkdir(dirname(STORAGE_STATE), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL: BASE_URL });

    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(E2E_USER.email);
    await page.getByLabel('パスワード').fill(E2E_USER.password);
    await page.getByRole('button', { name: 'ログイン' }).click();

    // アプリトップが出るまで待つ。ここが緩いと後続テストが不安定になる。
    await page.getByRole('heading', { name: /さん/ }).waitFor();

    await page.context().storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
