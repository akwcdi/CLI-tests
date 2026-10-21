import { expect, test, type Page } from '@playwright/test';

import { BASE_URL, E2E_MEMBER } from '../setup/env.ts';

/**
 * 申請管理。ここで見たいのは、ブラウザ操作が PostgreSQL の状態遷移と
 * DynamoDB の監査記録の両方に届いていること。
 * 個々の遷移規則そのものは UT / IT が見ている。
 */

const uniqueTitle = (label: string) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** 一覧から作成画面に入り、作る。着地点は作った申請の詳細。 */
async function createDraft(page: Page, title: string): Promise<void> {
  await page.getByRole('link', { name: '下書きを作る' }).click();
  await page.getByLabel('件名').fill(title);
  await page.getByLabel('金額').fill('12000');
  await page.getByRole('button', { name: '下書きを作る' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/requests');
  await expect(page.getByRole('heading', { name: '申請' })).toBeVisible();
});

test('アプリトップから申請管理に入れる', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: /申請管理/ })).toBeVisible();
  await page.getByRole('link', { name: /申請管理/ }).click();

  await expect(page).toHaveURL(/\/requests/);
  await expect(page.getByRole('heading', { name: '申請' })).toBeVisible();
});

test('下書きを作ると詳細に着き、一覧にも出る', async ({ page }) => {
  const title = uniqueTitle('備品');

  await createDraft(page, title);

  await expect(page.locator('.facts')).toContainText('¥12,000');
  // DynamoDB 側。PostgreSQL の行と同じ画面に並ぶ。
  await expect(page.getByRole('listitem').filter({ hasText: '申請を作成' })).toBeVisible();

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  const row = page.locator('tbody tr', { hasText: title });
  await expect(row).toContainText('下書き');
  await expect(row).toContainText('¥12,000');
});

test('金額が不正なら理由が出て、行は増えない', async ({ page }) => {
  const title = uniqueTitle('不正');

  await page.getByRole('link', { name: '下書きを作る' }).click();
  await page.getByLabel('件名').fill(title);
  await page.getByLabel('金額').fill('0');
  await page.getByRole('button', { name: '下書きを作る' }).click();

  await expect(page.getByRole('alert')).toContainText('金額');
  // 書き直せるよう、作成画面に入力ごと留まる。
  await expect(page.getByLabel('件名')).toHaveValue(title);

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(page.locator('tbody tr', { hasText: title })).toHaveCount(0);
});

test('自分が出した申請は自分では決裁できない', async ({ page }) => {
  const title = uniqueTitle('自己決裁');
  await createDraft(page, title);

  await page.getByRole('button', { name: '承認へ回す' }).click();
  await expect(page.getByText('承認待ち')).toBeVisible();

  await page.getByRole('button', { name: '承認する' }).click();

  await expect(page.getByRole('alert')).toContainText('自分が出した申請は決裁できません');
  await expect(page.getByText('承認待ち')).toBeVisible();
});

test('提出した申請を別の担当者が承認する', async ({ page, browser }) => {
  const title = uniqueTitle('承認');

  // 申請者（保存済みセッションの管理者）として提出する。
  await createDraft(page, title);
  await page.getByRole('button', { name: '承認へ回す' }).click();
  await expect(page.getByText('承認待ち')).toBeVisible();
  const requestUrl = page.url();

  // 決裁者は別の利用者。保存済みセッションを使わない新しい文脈で入る。
  const context = await browser.newContext({ baseURL: BASE_URL });
  try {
    const decider = await context.newPage();
    await decider.goto('/login');
    await decider.getByLabel('メールアドレス').fill(E2E_MEMBER.email);
    await decider.getByLabel('パスワード').fill(E2E_MEMBER.password);
    await decider.getByRole('button', { name: 'ログイン' }).click();
    await expect(decider.getByRole('heading', { name: /さん/ })).toBeVisible();

    await decider.goto(requestUrl);
    await decider.getByRole('button', { name: '承認する' }).click();

    await expect(decider.getByText('承認済み')).toBeVisible();
    // 決裁者名は上部バーにも出るため、詳細の定義リスト内に限定して確認する。
    await expect(decider.locator('.facts')).toContainText(E2E_MEMBER.name);
    await expect(decider.getByRole('listitem').filter({ hasText: '承認' }).first()).toBeVisible();
  } finally {
    await context.close();
  }

  // 申請者側でも承認済みになっていること。
  await page.reload();
  await expect(page.getByText('承認済み')).toBeVisible();
  await expect(page.getByRole('button', { name: '承認する' })).toHaveCount(0);
});

test('状態で絞り込める', async ({ page }) => {
  const title = uniqueTitle('絞り込み');
  await createDraft(page, title);
  await page.getByRole('link', { name: '一覧へ戻る' }).click();

  await page.getByRole('button', { name: '却下' }).click();

  await expect(page.locator('tbody tr', { hasText: title })).toHaveCount(0);

  await page.getByRole('button', { name: 'すべて' }).click();
  await expect(page.locator('tbody tr', { hasText: title })).toBeVisible();
});
