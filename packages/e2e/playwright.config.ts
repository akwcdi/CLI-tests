import { defineConfig, devices } from '@playwright/test';

import { APP_PORT, BASE_URL, E2E_ENV } from './setup/env.ts';

const isCI = process.env.CI === 'true' || process.env.CI === '1';

/** global-setup が書き出すログイン済みセッションの保存先。 */
export const STORAGE_STATE = '.auth/user.json';

/**
 * 外部で起動済みのアプリを指定されていなければ、こちらで起動する。
 * `E2E_BASE_URL` を設定するとそのアプリに向き、webServer は起動しない。
 */
const startOwnServer = process.env.E2E_BASE_URL === undefined;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // ログイン済みセッションを1回だけ作って全テストで使い回す。
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // 全テストが1つの DB を共有するので、ファイル内は直列にする。
  // 一覧やページングを見るテストが、別テストの作成・削除と競合するため。
  // ファイル間は並列のままなので workers は効く。
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [
        ['list'],
        ['junit', { outputFile: '../../.test-result/e2e-junit.xml' }],
        ['html', { open: 'never' }],
      ]
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
  // API と SPA を同一オリジンで配信するアプリ本体を起動する。
  // DB の作り直しとシードは setup/prepare.ts が先に済ませている。
  webServer: startOwnServer
    ? {
        command: 'pnpm --filter @test/app start',
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !isCI,
        timeout: 60_000,
        env: { ...E2E_ENV, PORT: String(APP_PORT) },
      }
    : undefined,
});
