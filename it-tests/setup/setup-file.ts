import { afterAll } from 'vitest';

import { closePool } from './db.ts';
import { closeDocClient } from './dynamo.ts';

// 各テストファイルの終了時に接続を解放する。
// 残っているとワーカーが終了できず、実行が固まる。
afterAll(async () => {
  await closePool();
  closeDocClient();
});
