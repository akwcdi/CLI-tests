import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';

import { BASE_URL } from '../setup/env.ts';

export { expect };

export interface Account {
  email: string;
  password: string;
}

/** アプリのオリジン以外への通信を止め、宛先を blocked に控える。 */
async function guardExternal(context: BrowserContext, blocked: string[]): Promise<void> {
  const origin = new URL(BASE_URL).origin;
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (new URL(url).origin === origin) {
      await route.fallback();
    } else {
      blocked.push(url);
      await route.abort();
    }
  });
}

export const test = base.extend<{
  externalGuard: void;
  /** 別の利用者として、別のブラウザ文脈でサインインした画面を開く。 */
  signInAs: (account: Account) => Promise<Page>;
}>({
  externalGuard: [
    async ({ context }, use) => {
      const blocked: string[] = [];
      await guardExternal(context, blocked);
      await use();
      expect(blocked, '外部への通信が発生した').toEqual([]);
    },
    { auto: true },
  ],

  signInAs: async ({ browser }, use, testInfo) => {
    const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = testInfo.project.use;
    const contexts: BrowserContext[] = [];
    const blocked: string[] = [];

    await use(async (account) => {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport,
        userAgent,
        isMobile,
        hasTouch,
        deviceScaleFactor,
      });
      contexts.push(context);
      await guardExternal(context, blocked);
      const page = await context.newPage();
      await signIn(page, account);
      return page;
    });

    await Promise.all(contexts.map((context) => context.close()));
    expect(blocked, '外部への通信が発生した').toEqual([]);
  },
});

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(account.email);
  await page.getByLabel('パスワード').fill(account.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByRole('heading', { name: /さん/ })).toBeVisible();
}

/** テスト間でデータを共有しているので、値の衝突を避ける。 */
export const unique = (label: string): string =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
