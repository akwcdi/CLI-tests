import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true' || process.env.CI === '1';

/** テスト対象アプリの URL。起動済みであること。 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

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
});
