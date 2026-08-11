# テスト構成

テストを **UT / IT / E2E** の3層に分ける。層ごとに責務と実行条件がはっきり分かれている。

| 層 | 置き場所 | 対象 | 外部依存 | 実行 |
|---|---|---|---|---|
| UT | `packages/*/tests/**/*.test.ts` | ロジック単体 | なし（すべてモック） | `pnpm test:ut` |
| IT | `it-tests/**/*.it.test.ts` | 実 DB / 実 DynamoDB との結合 | Docker | `pnpm test:it` |
| E2E | `packages/e2e/tests/**/*.spec.ts` | 画面越しの一連の操作 | 起動中のアプリ | `pnpm test:e2e` |

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
| `src/index.ts` | エントリポイント（再エクスポートのみ） |
| `src/types.ts` | 型定義（実行時コードなし） |
| `src/config.ts` | 設定値の読み出し |
| `src/db.ts` | DB / AWS クライアントの接続初期化 |

**これ以外を除外しない。** テストしにくいロジックが出てきたら、
除外するのではなく上記以外のファイルへ切り出してテストする。
監査は `/ut-run` が自動で行う。

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
pnpm --filter @test/e2e install:browser   # 初回のみ（Chromium）
pnpm test:e2e
```

Chromium のみ。`packages/e2e/global-setup.ts` が起動時に1度だけログインし、
セッションを `.auth/user.json` に保存して全テストで使い回す。
CI では `retries: 1` / `workers: 2`。

**アプリが起動している必要がある**（既定 `http://localhost:3000`、
`E2E_BASE_URL` で変更可）。ログイン画面のセレクタは
実際の画面に合わせて `global-setup.ts` を調整すること。

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
