/**
 * base ブランチとの差分に関係するシナリオだけを、PC とモバイルで回す。
 *
 *   pnpm test:e2e:changed            origin/main との差分
 *   pnpm test:e2e:changed <ref>      ref との差分
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readScenarios, readSpecs } from './ledger.ts';
import { selectScenarios } from './select.ts';
import { extractTests } from './test-ids.ts';

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(E2E_ROOT, '../..');
const base = process.argv[2] ?? 'origin/main';

const git = (...args: string[]): string[] =>
  execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

const changed = [
  ...new Set([
    ...git('diff', '--name-only', `${base}...HEAD`),
    ...git('diff', '--name-only', 'HEAD'),
    ...git('ls-files', '--others', '--exclude-standard'),
  ]),
];

const selection = selectScenarios(changed, readScenarios(), extractTests(readSpecs()).tests);

if (selection.ids.length === 0) {
  console.log('E2E に関係する変更はありません。');
  process.exit(0);
}
if (selection.all) {
  console.log(`共通部分の変更があるので全シナリオを回します: ${selection.reasons.join(', ')}`);
}
console.log(`対象: ${selection.ids.join(', ')}`);

const { status } = spawnSync(
  'node',
  [
    '--experimental-strip-types',
    'setup/run.ts',
    '--grep',
    selection.ids.map((id) => `@${id}`).join('|'),
  ],
  { cwd: E2E_ROOT, stdio: 'inherit' },
);
process.exit(status ?? 1);
