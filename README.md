# テスト構成

テストを **UT / IT / E2E** の3層に分ける。層ごとに責務と実行条件がはっきり分かれている。

| 層 | 置き場所 | 対象 | 外部依存 | 実行 |
|---|---|---|---|---|
| UT | `packages/*/tests/**/*.test.{ts,tsx}` | ロジック単体 | なし（すべてモック） | `pnpm test:ut` |
| IT | `it-tests/**/*.it.test.ts` | 実 DB / 実 DynamoDB との結合 | Docker | `pnpm test:it` |
| E2E | `packages/e2e/tests/**/*.spec.ts` | 画面越しの一連の操作 | Docker + アプリ | `pnpm test:e2e` |

## パッケージ

| パッケージ | 中身 |
|---|---|
| `@test/core` | ドメイン。users(PostgreSQL) と events(DynamoDB) のリポジトリ、認証 |
| `@test/app` | Hono の API。すべての変更操作が DynamoDB にイベントを書く |
| `@test/web` | React + Vite の管理コンソール |
| `@test/e2e` | Playwright |

判断に迷ったら: **モックで確かめられることは UT**。
「実際の並び順」「UNIQUE 制約」「型変換」のように
モックでは嘘をつけてしまうものだけを IT に置く。

## セットアップ

```bash
pnpm install
```

## UT

```bash
pnpm test:ut          # 1回実行（カバレッジ付き）
pnpm test:ut:watch    # 監視モード
```

Docker も DB も不要。設定は `vitest.config.ts`。

カバレッジは **lines / branches / functions / statements すべて 100% が閾値**で、
下回るとコマンドが失敗する。

### 除外できるファイル

`coverage.exclude` に置けるのは次の4つだけ。

| ファイル | 役割 |
|---|---|
| `src/index.ts` / `src/index.tsx` | エントリポイント（再エクスポート / マウントのみ） |
| `src/types.ts` | 型定義（実行時コードなし） |
| `src/config.ts` | 設定値の読み出し |
| `src/db.ts` | DB / AWS クライアントの接続初期化 |

**これ以外を除外しない。** テストしにくいロジックが出てきたら、
除外するのではなく上記以外のファイルへ切り出してテストする。
監査は `/ut-run` が自動で行う。

React コンポーネント（`.tsx`）も母集団に含まれる。jsdom を使うテストは
ファイル冒頭に `// @vitest-environment jsdom` を書く。`globals: false` なので
testing-library の自動クリーンアップは登録されない。
`packages/web/tests/helpers.tsx` が `afterEach(cleanup)` を持っているので、
web のテストは必ずこれを import すること。

プロセスを起動するだけのファイル（`packages/app/server.ts`）は `src/` の外に置く。
import しただけでポートを掴まないようにするためで、結果として母集団にも入らない。

## IT

```bash
pnpm docker:up        # PostgreSQL / Flyway / LocalStack を起動
pnpm test:it
pnpm docker:down      # 落とす（ボリュームも削除）
```

設定は `vitest.config.it.ts`。接続情報は同ファイルに直書きしてある
（`docker/docker-compose.yml` と対になるローカル・CI 専用の固定値）。

実行のたびに `it-tests/setup/global-setup.ts` が自動で行うこと:

1. `db_test` を **DROP → CREATE → Flyway migrate**
2. DynamoDB の `events` テーブルを **DROP → CREATE**

### テスト間の分離

ストアによって方式が違う。

```ts
// PostgreSQL: トランザクションを張り、各テスト後に ROLLBACK
describe('...', () => {
  const tx = useTransaction(getPool());
  it('...', async () => {
    const repo = new UserRepository(tx());
  });
});

// DynamoDB: ロールバックできないので毎回全削除
beforeEach(async () => {
  await clearDynamoTable();
});
```

`it-tests/factories/` のファクトリは `getDb()` 経由で書き込むため、
自動的に同じトランザクションに乗る。ファクトリを足すときは
`insert*(partial?: Partial<Row>): Promise<Row>` の形に揃えること。

## E2E

```bash
pnpm docker:up                            # IT と同じコンテナを使う
pnpm --filter @test/e2e install:browser   # 初回のみ（Chromium）
pnpm test:e2e
```

`pnpm test:e2e` が順に行うこと:

1. `@test/web` をビルド（アプリが `dist` を配信するため）
2. `packages/e2e/setup/prepare.ts` — `db_e2e` を作り直し、Flyway、
   `events_e2e` を作り直し、管理ユーザーとダミーデータを投入
3. `webServer` がアプリを起動（API と SPA を同一オリジンで配信）
4. `global-setup.ts` が1度だけログインし、`.auth/user.json` に保存
5. 各テストは保存済みセッションで始まる

**IT とは別の DB / テーブルを使う**（`db_e2e` / `events_e2e`）。
共有すると片方の後始末がもう片方を壊すため。

Chromium のみ。CI では `retries: 1` / `workers: 2`。
全テストが1つの DB を共有するので `fullyParallel: false`
（ファイル内は直列、ファイル間は並列）。

外部で起動済みのアプリに向けたい場合は `E2E_BASE_URL` を設定する。
そのときアプリの起動もシードもこちらでは行わない。

```bash
E2E_BASE_URL=http://localhost:8080 pnpm test:e2e
```

## CI

`CI=true` のとき JUnit XML を出力する。

| 層 | 出力先 |
|---|---|
| UT | `.test-result/ut-junit.xml` |
| IT | `.test-result/it-junit.xml` |
| E2E | `.test-result/e2e-junit.xml` |

## スラッシュコマンド

| コマンド | 用途 |
|---|---|
| `/ut-write <ファイル>` | 分析 → モック戦略 → ケース表 → 実装 → カバレッジ確認 の順で UT を書く |
| `/it-write <ファイル>` | 操作の洗い出し → ファクトリ準備 → ケース表 → 実装 の順で IT を書く |
| `/ut-run` | UT を実行し、`coverage.exclude` の違反を監査する |
| `/it-run` | Docker の起動を確認してから IT を実行する |
