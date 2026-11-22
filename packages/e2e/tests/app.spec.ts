import { expect, test, unique } from './fixtures.ts';

/** アプリトップと、どの画面からも使う導線。 */

test('アプリトップから両方のアプリに入れる', { tag: '@APP-001' }, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /ユーザー管理/ }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'ユーザー一覧' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: /申請管理/ }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByRole('heading', { name: '申請' })).toBeVisible();
});

test('アプリトップの件数が、登録と提出で増える', { tag: '@APP-002' }, async ({ page }) => {
  const count = (app: RegExp) =>
    page.getByRole('link', { name: app }).locator('.applink__count');
  const read = async (app: RegExp): Promise<number> => {
    await expect(count(app)).toHaveText(/^\d+$/);
    return Number(await count(app).innerText());
  };

  await page.goto('/');
  const users = await read(/ユーザー管理/);
  const pending = await read(/申請管理/);

  // 件数の増え方を見たいだけなので、準備は API で済ませる。
  await page.request.post('/api/users', {
    data: { email: `${unique('count')}@example.com`, name: 'Count', password: 'password123' },
  });
  const created = await page.request.post('/api/requests', {
    data: { title: unique('件数'), amount: 1000 },
  });
  const { request: draft } = (await created.json()) as { request: { id: string } };
  await page.request.post(`/api/requests/${draft.id}/submit`);

  await page.reload();
  await expect(count(/ユーザー管理/)).toHaveText(String(users + 1));
  await expect(count(/申請管理/)).toHaveText(String(pending + 1));
});

test('知らない URL はアプリトップへ戻す', { tag: '@APP-003' }, async ({ page }) => {
  await page.goto('/no-such-page');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /さん/ })).toBeVisible();
});

test('上部バーの製品名からアプリトップへ戻れる', { tag: '@APP-004' }, async ({ page }) => {
  await page.goto('/requests');

  await page.getByRole('link', { name: 'オペレーション基盤' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /さん/ })).toBeVisible();
});
