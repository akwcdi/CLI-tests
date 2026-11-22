import { BASE_URL, E2E_USER } from '../setup/env.ts';
import { expect, signIn, test } from './fixtures.ts';

// ログイン自体を確かめたいので、保存済みセッションを捨てて未ログインで始める。
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('ログイン', () => {
  test('未ログインで保護されたページを開くとログイン画面に飛ばされる', { tag: '@AUTH-001' }, async ({ page }) => {
    const guarded = ['/', '/users', '/users/1', '/requests', '/requests/new', '/requests/1'];

    for (const path of guarded) {
      await page.goto(path);

      await expect(page, path).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
    }
  });

  test('正しい資格情報でログインするとアプリトップに入り、開き直しても続いている', { tag: '@AUTH-002' }, async ({ page }) => {
    await signIn(page, E2E_USER);

    // ログイン後の着地点はアプリトップ。
    await expect(page).toHaveURL(/\/$/);

    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /さん/ })).toBeVisible();
  });

  test('資格情報が違うと同じエラーが出て、セッションは作られない', { tag: '@AUTH-003' }, async ({ page }) => {
    const attempts = [
      { email: E2E_USER.email, password: 'wrong-password' },
      // 登録の有無が分からないよう、居ないメールでも同じ文言にする。
      { email: 'nobody@example.com', password: E2E_USER.password },
    ];

    for (const { email, password } of attempts) {
      await page.goto('/login');
      await page.getByLabel('メールアドレス').fill(email);
      await page.getByLabel('パスワード').fill(password);
      await page.getByRole('button', { name: 'ログイン' }).click();

      await expect(page.getByRole('alert')).toHaveText('email or password is incorrect');
      await expect(page).toHaveURL(/\/login$/);
    }

    await page.goto('/users');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('ログアウトするとセッションが切れ、古い Cookie でも入れない', { tag: '@AUTH-004' }, async ({ page, playwright }) => {
    await signIn(page, E2E_USER);
    const signedIn = await page.context().storageState();

    // サインアウトは右上のユーザーメニューから。
    await page.locator('.usermenu__trigger').click();
    await page.getByRole('menuitem', { name: 'サインアウト' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/users');
    await expect(page).toHaveURL(/\/login$/);

    // ブラウザの Cookie が消えただけでなく、サーバー側でも無効になっている。
    const stale = await playwright.request.newContext({ baseURL: BASE_URL, storageState: signedIn });
    try {
      expect((await stale.get('/api/me')).status()).toBe(401);
    } finally {
      await stale.dispose();
    }
  });

  test('未ログインでは保護された API に届かない', { tag: '@AUTH-005' }, async ({ request }) => {
    const reads = ['/api/me', '/api/users', '/api/users/1', '/api/requests', '/api/requests/1', '/api/overview'];

    for (const path of reads) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    expect((await request.post('/api/users', { data: {} })).status()).toBe(401);
    expect((await request.post('/api/requests', { data: {} })).status()).toBe(401);
  });
});
