/**
 * 対応表の検査。ファイルを読み、ledger-core.ts の結果を表示する。
 *
 *   pnpm --filter @test/e2e ledger               検査する
 *   pnpm --filter @test/e2e ledger --write       inventory を生成し直してから検査する
 *   pnpm --filter @test/e2e ledger --base <ref>  baseline の増加も検査する
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractInventory, type Inventory, type SourceFile } from './inventory.ts';
import {
  checkLedger,
  type LedgerException,
  type PendingBaseline,
  type Scenario,
} from './ledger-core.ts';
import { extractTests } from './test-ids.ts';

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(E2E_ROOT, '../..');
const LEDGER_DIR = join(E2E_ROOT, 'ledger');
const BASELINE_PATH = 'packages/e2e/ledger/pending-baseline.json';

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(LEDGER_DIR, name), 'utf8')) as T;

function readTree(dir: string, match: (path: string) => boolean): SourceFile[] {
  return readdirSync(join(REPO_ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter(match)
    .map((path) => ({
      path: relative(REPO_ROOT, join(REPO_ROOT, dir, path)).split('\\').join('/'),
      text: readFileSync(join(REPO_ROOT, dir, path), 'utf8'),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

export function readSources(): SourceFile[] {
  const isSource = (path: string): boolean => /\.tsx?$/.test(path);
  return [
    ...readTree('packages/web/src', isSource),
    ...readTree('packages/app/src', isSource),
    ...readTree('packages/core/src', isSource),
    {
      path: 'packages/web/index.html',
      text: readFileSync(join(REPO_ROOT, 'packages/web/index.html'), 'utf8'),
    },
  ];
}

export function readSpecs(): SourceFile[] {
  return readTree('packages/e2e/tests', (path) => path.endsWith('.spec.ts'));
}

export function readScenarios(): Scenario[] {
  return readJson<Scenario[]>('scenarios.json');
}

function readBaseBaseline(ref: string): PendingBaseline | null {
  try {
    const text = execFileSync('git', ['show', `${ref}:${BASELINE_PATH}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(text) as PendingBaseline;
  } catch {
    // base にまだ無ければ、これが導入の PR。比較する相手が無い。
    console.log(`${ref} に baseline が無いので、増加の検査は省きます。`);
    return null;
  }
}

function main(args: readonly string[]): void {
  const { inventory, errors } = extractInventory(readSources());
  const inventoryPath = join(LEDGER_DIR, 'inventory.generated.json');

  if (args.includes('--write')) {
    writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`inventory を更新しました（${inventory.items.length} 件）`);
  }

  const baseIndex = args.indexOf('--base');
  const baseRef = baseIndex === -1 ? undefined : args[baseIndex + 1];
  const { tests, errors: testErrors } = extractTests(readSpecs());
  const scenarios = readScenarios();

  const findings = checkLedger({
    generated: inventory,
    committed: existsSync(inventoryPath) ? readJson<Inventory>('inventory.generated.json') : null,
    extractionErrors: errors,
    testErrors,
    scenarios,
    exceptions: readJson<LedgerException[]>('exceptions.json'),
    baseline: readJson<PendingBaseline>('pending-baseline.json'),
    baseBaseline: baseRef === undefined ? null : readBaseBaseline(baseRef),
    surfaces: readJson<Record<string, number>>('surfaces.json'),
    tests,
  });

  if (findings.length > 0) {
    console.error(`対応表の検査に失敗しました（${findings.length} 件）`);
    for (const finding of findings) {
      console.error(`  [${finding.rule}] ${finding.message}`);
    }
    process.exit(1);
  }
  const implemented = scenarios.filter((scenario) => scenario.status === 'implemented').length;
  console.log(
    `対応表の検査に通りました: 対象 ${inventory.items.length} 件 / シナリオ ${scenarios.length} 件（実装済み ${implemented} 件）`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
