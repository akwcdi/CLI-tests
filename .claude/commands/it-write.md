---
description: ソースファイルのインテグレーションテストを設計フローに沿って書く
argument-hint: <ソースファイルのパス>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(pnpm test:it*), Bash(pnpm docker:*), Bash(docker compose*)
---

対象ソースファイル: **$1**

このプロジェクトの IT 規約に従って、上記ファイルのインテグレーションテストを書く。
**必ず下の4ステップを順番に実行し、各ステップの結果をユーザーに見せてから次へ進むこと。**

## 前提（このプロジェクトの IT 規約）

- 設定は `vitest.config.it.ts`。実行は `pnpm test:it`（`/it-run` を使う）。
- テストの置き場所は `it-tests/` 配下、ファイル名は `<対象>.it.test.ts`。
- 実際の PostgreSQL（`db_test`）と LocalStack DynamoDB を使う。**モックしない。**
  モックで足りる検証は IT ではなく UT の担当（`/ut-write` を使う）。
- `it-tests/setup/global-setup.ts` が実行前に
  DB を DROP → CREATE → Flyway migrate、DynamoDB テーブルを DROP → CREATE する。
- タイムアウトは 30 秒。`fileParallelism: false`（同じ DB を共有するため）。

## 分離の方式（対象ごとに違う）

| ストア | 分離方法 | 書き方 |
|---|---|---|
| PostgreSQL | トランザクション + ROLLBACK | `describe` 直下で `const tx = useTransaction(getPool())` |
| DynamoDB | 毎回全削除 | `beforeEach(async () => { await clearDynamoTable(); })` |

DynamoDB にはロールバックが無いため、**`clearDynamoTable()` を省略しない**。

---

## Step 1. DB / DynamoDB 操作の洗い出し

`$1` を読み、外部ストアに触る箇所を表にまとめて提示する。

| メソッド | ストア | 操作 | 対象テーブル | 副作用・制約 |
|---|---|---|---|---|

特に次を明示する。

- 発行される SQL と、そこに効く**スキーマ制約**
  （UNIQUE / CHECK / NOT NULL / 外部キー / インデックス順）
- DynamoDB のキー構成（PK / SK）と `ScanIndexForward`、`Limit`、
  `ExclusiveStartKey` の使われ方
- **UT では検証できない部分はどこか**。ここが IT を書く理由になる。
  例: 実際の並び順、UNIQUE 制約違反、CHECK 制約、カーソルの往復、
  型変換（`timestamptz` → `Date`）、上書き挙動
- 必要なマイグレーションが `docker/flyway/sql/` に揃っているか。
  足りなければ `V<N>__<説明>.sql` の追加を提案する（**既存ファイルは編集しない**）。

## Step 2. ファクトリ準備

必要なテストデータを確認し、`it-tests/factories/` を見る。

- 既存: `insertUser()`（PostgreSQL）、`insertEvent()`（DynamoDB）
- 足りなければ新しいファクトリを追加する。シグネチャは必ず次の形にする。

```ts
export async function insertXxx(partial: Partial<XxxRow> = {}): Promise<XxxRow>
```

規約:

- 未指定のカラムは**毎回ユニークな既定値**で埋める
  （連番 + `Date.now()`。UNIQUE 制約に当たらないように）
- 挿入された行を `RETURNING` でそのまま返す
- PostgreSQL 側は必ず `getDb()` を経由する。
  これで `useTransaction` が張ったトランザクションに乗り、ROLLBACK が効く。
  ここで独自に Pool を掴むと**ロールバックが効かずテストが汚染される**。

## Step 3. テストケース表

実装前に、書くテストを表で提示してユーザーの確認を取る。

| # | describe | テスト名 | 事前データ | 操作 | 期待結果 | UT では見られない理由 |
|---|---|---|---|---|---|---|

最後の列が埋まらないケースは **UT に降ろす**。IT を厚くしすぎない。

含めるべき観点:

- 正常系の永続化と読み戻し（書いた値が実際に取れるか、型は何になるか）
- DB 制約違反（UNIQUE / CHECK）
- 並び順とページング（カーソルの往復が実データで成立するか）
- 存在しないキーに対する振る舞い

## Step 4. 実装

確認が取れたらテストファイルを書く。

- import は `@test/core` から。相対パスで `packages/core/src/...` を掘らない。
- PostgreSQL 用テストには、**分離が効いていることを示すテストを1組入れる**
  （1つ目で書き込み、2つ目でそれが残っていないことを確認する）。
- 実行して緑になるまで直す。

```bash
pnpm test:it
```

Docker が起動していない場合は `pnpm docker:up` を促す（`/it-run` を使ってもよい）。

最後に、追加・変更したファイルと実行結果を報告する。
