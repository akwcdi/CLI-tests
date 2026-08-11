import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true' || process.env.CI === '1';

/**
 * テスト対象アプリの URL。
 *
 * `E2E_BASE_URL` が指定されていればそのアプリに向ける（起動済みであること）。
 * 未指定なら、下の `webServer` がリポジトリ同梱のプレースホルダアプリを起動する。
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * 外部アプリを指定されていないので、こちらでプレースホルダを起動する必要があるか。
 * 実アプリに向けるときは `E2E_BASE_URL` を設定すればこのサーバーは起動しない。
 */
const usePlaceholderApp = process.env.E2E_BASE_URL === undefined;

/** global-setup が書き出すログイン済みセッションの保存先。 */
export const STORAGE_STATE = '.auth/user.json';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // ログイン済みセッションを1回だけ作って全テストで使い回す。
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['list'], ['junit', { outputFile: '../../.test-result/e2e-junit.xml' }], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // globalSetup より先に起動され、url が応答するまで待機する。
  // ローカルで既に手動起動している場合はそれを使い回す。
  webServer: usePlaceholderApp
    ? {
        command: 'node fixtures/placeholder-app.mjs',
        url: `${BASE_URL}/login`,
        reuseExistingServer: !isCI,
        timeout: 30_000,
      }
    : undefined,
});
