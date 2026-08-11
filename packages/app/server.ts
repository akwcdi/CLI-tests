/**
 * 実行可能なエントリポイント。プロセスを起動するだけ。
 *
 * `src/` の外に置いてあるのは2つの理由による。
 *  1. `@test/app` を import しただけでポートを掴まないようにするため
 *  2. カバレッジ母集団（packages/&#42;/src/&#42;&#42;）に入れないため
 *
 * ここに分岐やドメインロジックを書かないこと。書きたくなったら
 * それはテスト対象なので `src/` 側へ出す。
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { appConfig, createApp, createDeps } from './src/index.ts';

const app = createApp(createDeps());

// SPA を同一オリジンで配信する。API に当たらなかった GET は index.html に返す。
app.use('/assets/*', serveStatic({ root: appConfig.staticRoot }));
app.get('*', serveStatic({ path: 'index.html', root: appConfig.staticRoot }));

serve({ fetch: app.fetch, port: appConfig.port }, ({ port }) => {
  console.log(`app listening on http://localhost:${port}`);
});
