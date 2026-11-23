/**
 * E2E の入口。作り、回し、片付ける。引数は playwright test へそのまま渡す。
 *
 * 片付けで消すのはこの作業ツリー専用の DB とテーブルだけで、レポートは残す。
 * 調べたいときは `E2E_KEEP=1` で DB を残せる。
 * `E2E_BASE_URL` で外のアプリに向けるときは、準備も片付けもしない。
 */
import { spawnSync } from 'node:child_process';

import { cleanup, prepare } from './prepare.ts';

const managed = process.env.E2E_BASE_URL === undefined;

if (managed) {
  await prepare();
}

const { status } = spawnSync('pnpm', ['exec', 'playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (managed && process.env.E2E_KEEP === undefined) {
  await cleanup();
}
process.exit(status ?? 1);
