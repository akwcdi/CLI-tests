import { defineConfig } from 'vitest/config';

const isCI = process.env.CI === 'true' || process.env.CI === '1';

/**
 * UT（ユニットテスト）設定。
 *
 * UT は Docker も DB も使わない。外部 I/O は必ずモックすること。
 * IT は vitest.config.it.ts が担当する。
 */
export default defineConfig({
  test: {
    name: 'ut',
    // 各パッケージの tests/ 配下のみを UT とみなす。
    include: ['packages/*/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/e2e/**', 'it-tests/**'],
    environment: 'node',
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    reporters: isCI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: '.test-result/ut-junit.xml' },
    coverage: {
      provider: 'v8',
      enabled: true,
      reportsDirectory: 'coverage/ut',
      reporter: isCI ? ['text-summary', 'lcov', 'json-summary'] : ['text', 'html'],
      // カバレッジ母集団はプロダクトコードのみ。テストコードは含めない。
      include: ['packages/*/src/**/*.ts'],
      /**
       * 除外できるのは以下の4種類だけ。ここに他のファイルを足さないこと。
       *   src/index.ts  … エントリポイント（再エクスポートのみ）
       *   src/types.ts  … 型定義（実行時コードなし）
       *   src/config.ts … 設定値の読み出し
       *   src/db.ts     … DB / AWS クライアントの接続初期化
       * ロジックを含むファイルを除外したくなったら、そのロジックを
       * 別ファイルへ切り出してテストする。監査は `pnpm ut:audit` 相当の
       * .claude/commands/ut-run.md を参照。
       */
      exclude: [
        'packages/*/src/index.ts',
        'packages/*/src/types.ts',
        'packages/*/src/config.ts',
        'packages/*/src/db.ts',
      ],
      all: true,
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
