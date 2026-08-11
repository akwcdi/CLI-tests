import { defineConfig } from 'vitest/config';

const isCI = process.env.CI === 'true' || process.env.CI === '1';

/**
 * IT（インテグレーションテスト）用の接続情報。
 *
 * docker/docker-compose.yml と対になるローカル・CI 専用の固定値。
 * 本番の認証情報をここに書かないこと。
 */
const itEnv = {
  CID_DB_URL: 'postgres://user:pass@localhost:5432/db_test',
  LOCALSTACK_ENDPOINT: 'http://localhost:4566',
  AWS_REGION: 'ap-northeast-1',
  // LocalStack はダミー値で認証を通す。
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  EVENTS_TABLE_NAME: 'events',
  // global-setup が DB を作り直すときに使う管理接続先。
  CID_ADMIN_DB_URL: 'postgres://user:pass@localhost:5432/postgres',
  CID_TEST_DB_NAME: 'db_test',
} as const;

// `test.env` はワーカー側にしか届かないため、メインプロセスで動く
// globalSetup 用に process.env へも同じ値を流し込む。
Object.assign(process.env, itEnv);

/**
 * IT 設定。前提として `pnpm docker:up` で
 * PostgreSQL / Flyway / LocalStack が起動していること。
 */
export default defineConfig({
  test: {
    name: 'it',
    include: ['it-tests/**/*.it.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
    globalSetup: ['it-tests/setup/global-setup.ts'],
    setupFiles: ['it-tests/setup/setup-file.ts'],
    // DB / LocalStack への実アクセスがあるため長めに取る。
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 同じテーブルを共有するので、ファイル間の並列実行はしない。
    fileParallelism: false,
    sequence: { concurrent: false },
    clearMocks: true,
    restoreMocks: true,
    reporters: isCI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: '.test-result/it-junit.xml' },
    // IT ではカバレッジを測らない（100% 閾値は UT 側で担保する）。
    coverage: { enabled: false },
    env: { ...itEnv },
  },
});
