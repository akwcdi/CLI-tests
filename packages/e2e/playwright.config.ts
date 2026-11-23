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
  // 全テストが1つの DB を共有するので直列にする。一覧やページングを見るテストが、
  // 別テストの作成・削除と競合するため。同じ spec が PC とモバイルで走るので、
  // ファイル間を並列にすると同じ一覧を同時に動かすことになる。
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: isCI ? 1 : 0,
  // JSON は scripts/results.ts が読む。スキップや未実施をここから数える。
  reporter: [
    ['list'],
    ['json', { outputFile: '../../.test-result/e2e-results.json' }],
    ['html', { open: 'never' }],
    ...(isCI ? ([['junit', { outputFile: '../../.test-result/e2e-junit.xml' }]] as const) : []),
  ],
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // 名前はシナリオ台帳の viewports と揃える（ledger/scenarios.json）。
  projects: [
    {
      name: 'pc',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // API と SPA を同一オリジンで配信するアプリ本体を起動する。
  // DB の作り直しとシードは setup/prepare.ts が先に済ませている。
  webServer: startOwnServer
    ? {
        command: 'pnpm --filter @test/app start',
        url: `${BASE_URL}/api/health`,
        // 使い回すと、E2E の DB を見ていない別のアプリ（pnpm dev など）に繋がる。
        reuseExistingServer: false,
        timeout: 60_000,
        env: { ...E2E_ENV, PORT: String(APP_PORT) },
      }
    : undefined,
});
