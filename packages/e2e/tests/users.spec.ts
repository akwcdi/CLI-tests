import type { Page } from '@playwright/test';

import { E2E_USER } from '../setup/env.ts';
import { expect, test, unique } from './fixtures.ts';

/**
 * 保存済みセッションで始まるので、各テストはログイン手順を書かない。
 *
 * ここで確かめたいのは「ブラウザ操作 → API → PostgreSQL と DynamoDB」が
 * 一本の線として繋がっていること。単体の振る舞いは UT / IT が見ている。
 * 保存系は、開き直しても値が残っているところまで見る。
 */

const uniqueEmail = (label: string) => `${unique(label)}@example.com`;

const userRow = (page: Page, text: string) => page.locator('tbody tr', { hasText: text });

async function createUser(page: Page, email: string, name: string, password = 'password123'): Promise<void> {
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('名前').fill(name);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: '作成' }).click();
}

/** 一覧で作って、その人の詳細を開く。 */
async function openNewUser(page: Page, name: string): Promise<string> {
  const email = uniqueEmail('detail');
  await createUser(page, email, name);
  await userRow(page, email).getByRole('link').click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return email;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'ユーザー一覧' })).toBeVisible();
});

test('右上のメニューを開くとサインイン中のユーザーが出て、Escape と外側クリックで閉じる', { tag: '@USER-001' }, async ({ page }) => {
  // 狭い幅では名前を隠すので、役割と名前では掴めない。
  const trigger = page.locator('.usermenu__trigger');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toContainText(E2E_USER.name);
  await expect(menu).toContainText(E2E_USER.email);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.getByTestId('usermenu-backdrop').click();
  await expect(menu).toHaveCount(0);
});

test('メニューの「自分のアカウント」で自分の詳細に入れる', { tag: '@USER-002' }, async ({ page }) => {
  await page.locator('.usermenu__trigger').click();
  await page.getByRole('menuitem', { name: '自分のアカウント' }).click();

  await expect(page.getByRole('heading', { name: E2E_USER.name })).toBeVisible();
  await expect(page.locator('.facts')).toContainText(E2E_USER.email);
});

test('一覧にシード済みのユーザーが並ぶ', { tag: '@USER-003' }, async ({ page }) => {
  const rows = page.locator('tbody tr');

  // PAGE_SIZE は 5。シードは 8 件あるので 1 ページ目は埋まる。
  await expect(rows).toHaveCount(5);
  await expect(page.getByRole('button', { name: '次へ' })).toBeEnabled();
});

test('作成したユーザーが一覧に現れ、開き直しても残り、詳細に作成イベントが記録される', { tag: '@USER-004' }, async ({ page }) => {
  const email = uniqueEmail('created');

  await createUser(page, email, 'Created User');

  // PostgreSQL 側: 一覧に出て、入力欄は次の登録のために空になる。
  await expect(userRow(page, email)).toBeVisible();
  await expect(page.getByLabel('メールアドレス')).toHaveValue('');

  await page.reload();
  await expect(userRow(page, email)).toContainText('Created User');

  // DynamoDB 側: 詳細のイベント履歴に出る。
  await userRow(page, email).getByRole('link', { name: 'Created User' }).click();
  await expect(page.getByRole('heading', { name: 'Created User' })).toBeVisible();
  await expect(page.getByTestId('status')).toHaveText('有効');
  await expect(page.locator('.facts')).toContainText(email);
  await expect(page.getByRole('listitem').filter({ hasText: 'ユーザーを作成' })).toBeVisible();
});

test('重複したメールはエラーになり、開き直しても行は増えていない', { tag: '@USER-005' }, async ({ page }) => {
  const email = uniqueEmail('dup');
  await createUser(page, email, 'First');
  await expect(userRow(page, email)).toBeVisible();

  await createUser(page, email, 'Second');

  await expect(page.getByRole('alert')).toContainText('email already registered');
  await expect(userRow(page, email)).toHaveCount(1);

  await page.reload();
  await expect(userRow(page, email)).toHaveCount(1);
  await expect(userRow(page, email)).toContainText('First');
});

test('不正な入力は理由が出て、入力が残り、保存されない', { tag: '@USER-006' }, async ({ page }) => {
  const name = unique('invalid');
  const cases = [
    { email: 'not-an-email', name, password: 'password123', message: 'invalid email format' },
    { email: uniqueEmail('no-name'), name: '   ', password: 'password123', message: 'name is required' },
    { email: uniqueEmail('short'), name, password: 'short', message: 'password must be at least 8' },
  ];

  for (const input of cases) {
    await createUser(page, input.email, input.name, input.password);

    await expect(page.getByRole('alert')).toContainText(input.message);
    await expect(page.getByLabel('メールアドレス')).toHaveValue(input.email);
  }

  await page.reload();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(userRow(page, name)).toHaveCount(0);
  await expect(userRow(page, cases[1]?.email ?? '')).toHaveCount(0);
  await expect(userRow(page, cases[2]?.email ?? '')).toHaveCount(0);
});

test('停止すると詳細と一覧の両方に反映され、開き直しても残り、履歴にも残る', { tag: '@USER-007' }, async ({ page }) => {
  const email = await openNewUser(page, 'Suspend Me');
  await expect(page.getByTestId('status')).toHaveText('有効');

  await page.getByRole('button', { name: '停止する' }).click();

  await expect(page.getByTestId('status')).toHaveText('停止中');
  await expect(page.getByRole('listitem').filter({ hasText: '状態を変更' })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('status')).toHaveText('停止中');
  await expect(page.getByRole('button', { name: '再開する' })).toBeVisible();

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(userRow(page, email)).toContainText('停止中');
});

test('停止したユーザーを再開でき、開き直しても残る', { tag: '@USER-008' }, async ({ page }) => {
  await openNewUser(page, 'Resume Me');
  await page.getByRole('button', { name: '停止する' }).click();
  await expect(page.getByTestId('status')).toHaveText('停止中');

  await page.getByRole('button', { name: '再開する' }).click();

  await expect(page.getByTestId('status')).toHaveText('有効');
  await expect(page.getByRole('listitem').filter({ hasText: '状態を変更' })).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId('status')).toHaveText('有効');
});

test('別のタブで先に変更された状態へは変更できず、履歴も増えない', { tag: '@USER-009' }, async ({ page, context }) => {
  await openNewUser(page, 'Same Status');
  const stale = await context.newPage();
  await stale.goto(page.url());
  await expect(stale.getByRole('button', { name: '停止する' })).toBeVisible();

  await page.getByRole('button', { name: '停止する' }).click();
  await expect(page.getByTestId('status')).toHaveText('停止中');

  // 古い画面にはまだ「停止する」が出ている。同じ状態への遷移になる。
  await stale.getByRole('button', { name: '停止する' }).click();
  await expect(stale.getByRole('alert')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('status')).toHaveText('停止中');
  await expect(page.getByRole('listitem').filter({ hasText: '状態を変更' })).toHaveCount(1);
});

test('削除すると一覧から消え、開き直しても戻らず、詳細も開けない', { tag: '@USER-010' }, async ({ page }) => {
  const email = await openNewUser(page, 'Delete Me');
  const detailUrl = page.url();

  await page.getByRole('button', { name: '削除する' }).click();

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(userRow(page, email)).toHaveCount(0);

  await page.reload();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(userRow(page, email)).toHaveCount(0);

  await page.goto(detailUrl);
  await expect(page.getByText('ユーザーが見つかりません。')).toBeVisible();
});

test('サインイン中の自分は削除できない', { tag: '@USER-011' }, async ({ page }) => {
  await page.locator('.usermenu__trigger').click();
  await page.getByRole('menuitem', { name: '自分のアカウント' }).click();
  await expect(page.getByRole('heading', { name: E2E_USER.name })).toBeVisible();

  await page.getByRole('button', { name: '削除する' }).click();

  await expect(page.getByRole('alert')).toContainText('cannot delete the currently signed-in user');

  await page.reload();
  await expect(page.getByRole('heading', { name: E2E_USER.name })).toBeVisible();
});

test('ページを進めても重複せず、前へと先頭へで戻れる', { tag: '@USER-012' }, async ({ page }) => {
  // 名前は重複しうるので、一意なメールの列で比べる。
  // 狭い幅ではこの列を隠すので、見た目ではなく textContent で読む。
  const cells = page.locator('tbody tr td:nth-child(2)');
  const note = page.locator('.pager__note');
  const next = page.getByRole('button', { name: '次へ' });

  await expect(page.locator('tbody tr').first()).toBeVisible();
  const first = await cells.allTextContents();
  const firstTop = first[0] ?? '';
  await expect(page.getByRole('button', { name: '前へ' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '先頭へ' })).toBeDisabled();

  await next.click();

  // 「先頭へ」の活性化は cursor を設定した時点で起きるので、取得完了の
  // 目印にならない。先頭行が入れ替わるまで待つ。
  await expect(cells.first()).not.toHaveText(firstTop);
  await expect(note).toHaveText('2 ページ目');
  const second = await cells.allTextContents();
  expect(second.filter((email) => first.includes(email))).toEqual([]);

  await page.getByRole('button', { name: '前へ' }).click();
  await expect(cells.first()).toHaveText(firstTop);
  await expect(note).toHaveText('1 ページ目');

  await next.click();
  await expect(cells.first()).not.toHaveText(firstTop);
  await page.getByRole('button', { name: '先頭へ' }).click();
  await expect(cells.first()).toHaveText(firstTop);
  await expect(note).toHaveText('1 ページ目');
});

test('2 ページ目で作成すると、追加した行が見える先頭ページに戻る', { tag: '@USER-013' }, async ({ page }) => {
  const email = uniqueEmail('from-second-page');
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(page.locator('.pager__note')).toHaveText('2 ページ目');

  await createUser(page, email, 'From Second Page');

  await expect(page.locator('.pager__note')).toHaveText('1 ページ目');
  await expect(userRow(page, email)).toBeVisible();
});

test('存在しないユーザーの詳細は、見つからない旨を出して一覧へ戻れる', { tag: '@USER-014' }, async ({ page }) => {
  await page.goto('/users/00000000-0000-0000-0000-000000000000');

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('ユーザーが見つかりません。')).toBeVisible();

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(page).toHaveURL(/\/users$/);
});
