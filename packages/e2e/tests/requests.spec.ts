import type { Page } from '@playwright/test';

import { E2E_MEMBER } from '../setup/env.ts';
import { expect, test, unique } from './fixtures.ts';

/**
 * 申請管理。ここで見たいのは、ブラウザ操作が PostgreSQL の状態遷移と
 * DynamoDB の監査記録の両方に届いていること。
 * 個々の遷移規則そのものは UT / IT が見ている。
 * 保存系は、開き直しても値が残っているところまで見る。
 */

const uniqueTitle = unique;

const requestRow = (page: Page, title: string) => page.locator('tbody tr', { hasText: title });
/** 詳細の状態。「却下」などの語はボタンや履歴にも出るので、見出しの横に限定する。 */
const badge = (page: Page) => page.locator('.page__head .status');

/** 一覧から作成画面に入り、作る。着地点は作った申請の詳細。 */
async function createDraft(page: Page, title: string): Promise<void> {
  await page.getByRole('link', { name: '下書きを作る' }).click();
  await page.getByLabel('件名').fill(title);
  await page.getByLabel('金額').fill('12000');
  await page.getByRole('button', { name: '下書きを作る' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

/** 下書きを作って提出する。戻り値は詳細の URL。 */
async function createPending(page: Page, title: string): Promise<string> {
  await createDraft(page, title);
  await page.getByRole('button', { name: '承認へ回す' }).click();
  await expect(badge(page)).toHaveText('承認待ち');
  return page.url();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/requests');
  await expect(page.getByRole('heading', { name: '申請' })).toBeVisible();
});

test('下書きを作ると詳細に着き、開き直しても残り、一覧にも出る', { tag: '@REQ-001' }, async ({ page }) => {
  const title = uniqueTitle('備品');

  await createDraft(page, title);

  await expect(page).toHaveURL(/\/requests\/[^/]+$/);
  await expect(badge(page)).toHaveText('下書き');
  await expect(page.locator('.facts')).toContainText('¥12,000');
  // DynamoDB 側。PostgreSQL の行と同じ画面に並ぶ。
  await expect(page.getByRole('listitem').filter({ hasText: '申請を作成' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.locator('.facts')).toContainText('¥12,000');

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  const row = requestRow(page, title);
  await expect(row).toContainText('下書き');
  await expect(row).toContainText('¥12,000');

  // 一覧の行から詳細に戻れる。
  await row.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('不正な入力は理由が出て、入力が残り、保存されない', { tag: '@REQ-002' }, async ({ page }) => {
  const title = uniqueTitle('不正');
  const cases = [
    { title, amount: '0', message: '金額は1以上' },
    { title, amount: 'abc', message: '金額は整数' },
    { title, amount: '1.5', message: '金額は整数' },
    { title, amount: '100000001', message: '100,000,000以下' },
    { title: '   ', amount: '1000', message: '件名を入力してください' },
    { title: `${title}${'x'.repeat(120)}`, amount: '1000', message: '120文字以内' },
  ];

  await page.getByRole('link', { name: '下書きを作る' }).click();
  for (const input of cases) {
    await page.getByLabel('件名').fill(input.title);
    await page.getByLabel('金額').fill(input.amount);
    await page.getByRole('button', { name: '下書きを作る' }).click();

    await expect(page.getByRole('alert')).toContainText(input.message);
    // 書き直せるよう、作成画面に入力ごと留まる。
    await expect(page).toHaveURL(/\/requests\/new$/);
    await expect(page.getByLabel('件名')).toHaveValue(input.title);
    await expect(page.getByLabel('金額')).toHaveValue(input.amount);
  }

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(page.getByRole('heading', { name: '申請' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.pager')).toBeVisible();
  await expect(requestRow(page, title)).toHaveCount(0);
});

test('提出すると承認待ちになり、開き直しても残り、経過に記録される', { tag: '@REQ-003' }, async ({ page }) => {
  const title = uniqueTitle('提出');

  await createPending(page, title);

  await expect(page.getByRole('listitem').filter({ hasText: '承認へ提出' })).toBeVisible();
  await expect(page.getByRole('button', { name: '承認へ回す' })).toHaveCount(0);

  await page.reload();
  await expect(badge(page)).toHaveText('承認待ち');

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(requestRow(page, title)).toContainText('承認待ち');
});

test('他人の下書きは提出できず、下書きのまま残る', { tag: '@REQ-004' }, async ({ page, signInAs }) => {
  await createDraft(page, uniqueTitle('他人の提出'));

  const other = await signInAs(E2E_MEMBER);
  await other.goto(page.url());
  await other.getByRole('button', { name: '承認へ回す' }).click();

  await expect(other.getByRole('alert')).toContainText('他人の申請は提出できません');

  await page.reload();
  await expect(badge(page)).toHaveText('下書き');
});

test('自分が出した申請は自分では承認も却下もできず、承認待ちのまま残る', { tag: '@REQ-005' }, async ({ page }) => {
  await createPending(page, uniqueTitle('自己決裁'));

  for (const action of ['承認する', '却下する']) {
    await page.getByRole('button', { name: action }).click();

    await expect(page.getByRole('alert')).toContainText('自分が出した申請は決裁できません');
    await page.reload();
    await expect(badge(page)).toHaveText('承認待ち');
  }
  await expect(page.locator('.facts')).toContainText('未決裁');
});

test('提出した申請を別の担当者が承認し、開き直しても両者に残る', { tag: '@REQ-006' }, async ({ page, signInAs }) => {
  const title = uniqueTitle('承認');
  const requestUrl = await createPending(page, title);

  const decider = await signInAs(E2E_MEMBER);
  await decider.goto(requestUrl);
  await decider.getByRole('button', { name: '承認する' }).click();

  await expect(badge(decider)).toHaveText('承認済み');
  // 決裁者名は上部バーにも出るため、詳細の定義リスト内に限定して確認する。
  await expect(decider.locator('.facts')).toContainText(E2E_MEMBER.name);
  await expect(decider.getByRole('listitem').filter({ hasText: '承認' }).first()).toBeVisible();

  // 申請者側でも承認済みになっていること。
  await page.reload();
  await expect(badge(page)).toHaveText('承認済み');
  await expect(page.locator('.facts')).toContainText(E2E_MEMBER.name);
  await expect(page.getByRole('button', { name: '承認する' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '却下する' })).toHaveCount(0);

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await page.getByRole('button', { name: '承認済み' }).click();
  await expect(requestRow(page, title)).toContainText('承認済み');
});

test('提出した申請を別の担当者が却下し、開き直しても両者に残る', { tag: '@REQ-007' }, async ({ page, signInAs }) => {
  const title = uniqueTitle('却下');
  const requestUrl = await createPending(page, title);

  const decider = await signInAs(E2E_MEMBER);
  await decider.goto(requestUrl);
  await decider.getByRole('button', { name: '却下する' }).click();

  await expect(badge(decider)).toHaveText('却下');
  await expect(decider.locator('.facts')).toContainText(E2E_MEMBER.name);
  await expect(decider.getByRole('listitem').filter({ hasText: '却下' })).toBeVisible();

  await page.reload();
  await expect(badge(page)).toHaveText('却下');
  await expect(page.getByRole('button', { name: '承認する' })).toHaveCount(0);

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await page.getByRole('button', { name: '却下', exact: true }).click();
  await expect(requestRow(page, title)).toContainText('却下');
});

test('決裁済みの申請を古い画面から決裁し直しても、結果は変わらない', { tag: '@REQ-008' }, async ({ page, signInAs }) => {
  const requestUrl = await createPending(page, uniqueTitle('二重決裁'));

  const decider = await signInAs(E2E_MEMBER);
  await decider.goto(requestUrl);
  const stale = await decider.context().newPage();
  await stale.goto(requestUrl);
  await expect(stale.getByRole('button', { name: '却下する' })).toBeVisible();

  await decider.getByRole('button', { name: '承認する' }).click();
  await expect(badge(decider)).toHaveText('承認済み');

  await stale.getByRole('button', { name: '却下する' }).click();
  await expect(stale.getByRole('alert')).toBeVisible();

  await decider.reload();
  await expect(badge(decider)).toHaveText('承認済み');
  await expect(decider.getByRole('listitem').filter({ hasText: '却下' })).toHaveCount(0);
});

test('状態で絞り込める', { tag: '@REQ-009' }, async ({ page }) => {
  const draft = uniqueTitle('絞り込み下書き');
  const pending = uniqueTitle('絞り込み承認待ち');
  await createDraft(page, draft);
  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await createPending(page, pending);
  await page.getByRole('link', { name: '一覧へ戻る' }).click();

  const filter = (label: string) => page.getByRole('button', { name: label, exact: true });

  await filter('下書き').click();
  await expect(filter('下書き')).toHaveAttribute('aria-pressed', 'true');
  await expect(requestRow(page, draft)).toBeVisible();
  await expect(requestRow(page, pending)).toHaveCount(0);

  await filter('承認待ち').click();
  await expect(requestRow(page, pending)).toBeVisible();
  await expect(requestRow(page, draft)).toHaveCount(0);

  await filter('却下').click();
  await expect(filter('却下')).toHaveAttribute('aria-pressed', 'true');
  await expect(requestRow(page, draft)).toHaveCount(0);
  await expect(requestRow(page, pending)).toHaveCount(0);

  await filter('すべて').click();
  await expect(requestRow(page, draft)).toBeVisible();
  await expect(requestRow(page, pending)).toBeVisible();
});

test('ページを進めても重複せず、前へと先頭へで戻れる', { tag: '@REQ-010' }, async ({ page }) => {
  // ページングを見たいだけなので、件数を揃える準備は API で済ませる。
  for (let i = 0; i < 6; i += 1) {
    await page.request.post('/api/requests', { data: { title: uniqueTitle('ページ'), amount: 100 } });
  }
  await page.reload();

  const cells = page.locator('tbody tr td:first-child');
  const note = page.locator('.pager__note');
  await expect(cells.first()).toBeVisible();
  const first = await cells.allInnerTexts();
  const firstTop = first[0] ?? '';

  await page.getByRole('button', { name: '次へ' }).click();
  await expect(cells.first()).not.toHaveText(firstTop);
  await expect(note).toHaveText('2 ページ目');
  const second = await cells.allInnerTexts();
  expect(second.filter((title) => first.includes(title))).toEqual([]);

  await page.getByRole('button', { name: '前へ' }).click();
  await expect(cells.first()).toHaveText(firstTop);

  await page.getByRole('button', { name: '次へ' }).click();
  await expect(cells.first()).not.toHaveText(firstTop);
  await page.getByRole('button', { name: '先頭へ' }).click();
  await expect(cells.first()).toHaveText(firstTop);
  await expect(note).toHaveText('1 ページ目');
});

test('存在しない申請の詳細は、見つからない旨を出して一覧へ戻れる', { tag: '@REQ-011' }, async ({ page }) => {
  await page.goto('/requests/00000000-0000-0000-0000-000000000000');

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('申請が見つかりません。')).toBeVisible();

  await page.getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(page).toHaveURL(/\/requests$/);
});
