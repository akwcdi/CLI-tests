import { defineConfig } from 'vitest/config';

/**
 * 対応表の検査スクリプト自体のテスト。ブラウザも Docker も使わない。
 * ルートの vitest.config.ts は packages/e2e を対象外にしている。
 */
export default defineConfig({
  test: {
    name: 'e2e-ledger',
    include: ['scripts/tests/**/*.test.ts'],
    environment: 'node',
  },
});
