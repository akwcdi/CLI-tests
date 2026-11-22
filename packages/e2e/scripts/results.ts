/**
 * 直前の E2E の結果を要約する。PR の検証欄にはこの出力を貼る。
 *
 *   pnpm --filter @test/e2e results          失敗・スキップがあれば落ちる
 *   pnpm --filter @test/e2e results --all    未実施があっても落ちる（全件実行の確認）
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readScenarios } from './ledger.ts';
import { summarizeResults, type JsonSuite } from './results-core.ts';

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = resolve(E2E_ROOT, '../../.test-result/e2e-results.json');

const report = JSON.parse(readFileSync(REPORT, 'utf8')) as { suites?: JsonSuite[] };
const scenarios = readScenarios();
const summary = summarizeResults(report, scenarios);
const pending = scenarios.filter((scenario) => scenario.status === 'pending');

const line = (label: string, entries: readonly string[]): void => {
  console.log(`${label}: ${entries.length} 件${entries.length > 0 ? `（${entries.join(', ')}）` : ''}`);
};

console.log(`成功: ${summary.passed} 件（シナリオ × ビューポート）`);
line('再試行で成功', summary.flaky);
line('失敗・スキップ', summary.failed);
line('今回未実施', summary.notRun);
line(
  '未実装（pending）',
  pending.map((scenario) => `${scenario.id} ${scenario.title}`),
);

if (summary.failed.length > 0 || (process.argv.includes('--all') && summary.notRun.length > 0)) {
  process.exit(1);
}
