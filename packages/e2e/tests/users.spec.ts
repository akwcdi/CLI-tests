import { expect, test, type Page } from '@playwright/test';

/**
 * 保存済みセッションで始まるので、各テストはログイン手順を書かない。
 *
 * ここで確かめたいのは「ブラウザ操作 → API → PostgreSQL と DynamoDB」が
 * 一本の線として繋がっていること。単体の振る舞いは UT / IT が見ている。
 */

/** 一意なメールを作る。テスト間でデータを共有しているため衝突を避ける。 */
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function createUser(page: Page, email: string, name: string): Promise<void> {
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('名前').fill(name);
  await page.getByLabel('パスワード').fill('password123');
  await page.getByRole('button', { name: '作成' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'ユーザー一覧' })).toBeVisible();
});

test('一覧にシード済みのユーザーが並ぶ', async ({ page }) => {
  const rows = page.locator('tbody tr');

  // PAGE_SIZE は 5。シードは 8 件あるので 1 ページ目は埋まる。
  await expect(rows).toHaveCount(5);
  await expect(page.getByRole('button', { name: '次へ' })).toBeEnabled();
});

test('作成したユーザーが一覧に現れ、詳細に作成イベントが記録される', async ({ page }) => {
  const email = uniqueEmail('created');

  await createUser(page, email, 'Created User');

  // PostgreSQL 側: 一覧に出る
  const row = page.locator('tbody tr', { hasText: email });
  await expect(row).toBeVisible();

  // DynamoDB 側: 詳細のイベント履歴に出る。
  // この 1 本だけが 2 ストアの整合を見ている。
  await row.getByRole('link', { name: 'Created User' }).click();
  await expect(page.getByRole('heading', { name: 'Created User' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'user.created' })).toBeVisible();
});

test('重複したメールはエラーになり、行は増えない', async ({ page }) => {
  const email = uniqueEmail('dup');
  await createUser(page, email, 'First');
  await expect(page.locator('tbody tr', { hasText: email })).toBeVisible();

  await createUser(page, email, 'Second');

  await expect(page.getByRole('alert')).toContainText('email already registered');
  await expect(page.locator('tbody tr', { hasText: email })).toHaveCount(1);
});

test('停止すると詳細と一覧の両方に反映され、履歴にも残る', async ({ page }) => {
  const email = uniqueEmail('suspend');
  await createUser(page, email, 'Suspend Me');

  await page.locator('tbody tr', { hasText: email }).getByRole('link').click();
  await expect(page.getByTestId('status')).toHaveText('有効');

  await page.getByRole('button', { name: '停止する' }).click();

  await expect(page.getByTestId('status')).toHaveText('停止中');
  await expect(
    page.getByRole('listitem').filter({ hasText: 'user.status_changed' }),
  ).toBeVisible();

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(page.locator('tbody tr', { hasText: email })).toContainText('停止中');
});

test('同じ状態への変更はエラーになる', async ({ page }) => {
  const email = uniqueEmail('same-status');
  await createUser(page, email, 'Same Status');

  await page.locator('tbody tr', { hasText: email }).getByRole('link').click();
  await page.getByRole('button', { name: '停止する' }).click();
  await expect(page.getByTestId('status')).toHaveText('停止中');

  // 表示は「再開する」に変わっている。API を直接叩いて同一遷移を試す。
  const response = await page.request.patch(`/api/users${new URL(page.url()).pathname.replace('/users', '')}/status`, {
    data: { status: 'suspended' },
  });

  expect(response.status()).toBe(400);
});

test('削除すると一覧から消える', async ({ page }) => {
  const email = uniqueEmail('delete');
  await createUser(page, email, 'Delete Me');

  await page.locator('tbody tr', { hasText: email }).getByRole('link').click();
  await page.getByRole('button', { name: '削除する' }).click();

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.locator('tbody tr', { hasText: email })).toHaveCount(0);
});

test('ページを跨いでも同じユーザーが重複しない', async ({ page }) => {
  const cells = page.locator('tbody tr td:first-child');
  const namesOn = () => cells.allInnerTexts();

  const first = await namesOn();
  const firstTop = first[0] ?? '';

  await page.getByRole('button', { name: '次へ' }).click();

  // 「先頭へ」の活性化は cursor を設定した時点で起きるので、取得完了の
  // 目印にならない。先頭行が入れ替わるまで待つ。
  await expect(cells.first()).not.toHaveText(firstTop);

  const second = await namesOn();
  expect(second.filter((name) => first.includes(name))).toEqual([]);
});
