---
description: Docker の起動を確認してから IT を実行する
allowed-tools: Read, Grep, Glob, Bash(pnpm test:it*), Bash(pnpm docker:*), Bash(docker*)
---

IT を実行する。**必ず Docker の状態を確認してから走らせること。**
$ARGUMENTS

## Step 1. Docker デーモンの確認

```bash
docker info --format '{{.ServerVersion}}'
```

失敗した場合は **そこで止める**。`pnpm test:it` を実行しない。
ユーザーに Docker Desktop の起動を依頼する（macOS なら `open -a Docker`）。
起動には数十秒かかるので、勝手に待ち続けずユーザーに委ねる。

## Step 2. コンテナの確認

```bash
docker compose -f docker/docker-compose.yml ps --format json
```

必要なのは次の2つ。

| サービス | 期待状態 | ポート |
|---|---|---|
| `postgres` | running かつ healthy | 5432 |
| `localstack` | running かつ healthy | 4566 |

`flyway` は一度実行して終了する使い捨てサービスなので、
**exited になっていて正常**。落ちているとは判断しない。

どちらかが未起動、または healthy でない場合:

```bash
pnpm docker:up
```

を実行し、healthy になるまで待つ。`--wait` が付いているので待機は自動。
ここで失敗するときはポート競合（5432 / 4566 を別プロセスが使っている）を疑い、
`lsof -i :5432` / `lsof -i :4566` で確認して報告する。

## Step 3. IT 実行

```bash
pnpm test:it
```

実行前に `it-tests/setup/global-setup.ts` が自動で次を行う。
これはテスト実行のたびに走るので、手動での DB リセットは不要。

- `db_test` を DROP → CREATE → Flyway migrate
- DynamoDB の `events` テーブルを DROP → CREATE

## Step 4. 失敗時の切り分け

| 症状 | 疑うところ |
|---|---|
| `ECONNREFUSED localhost:5432` | postgres が未起動、またはポート競合 |
| `ECONNREFUSED localhost:4566` | localstack が未起動 |
| global-setup で失敗 | Flyway のマイグレーション失敗。`docker compose -f docker/docker-compose.yml logs flyway` を見る |
| `relation "..." does not exist` | `docker/flyway/sql/` にマイグレーションが足りない |
| `ResourceNotFoundException` | DynamoDB テーブル名の不一致。`EVENTS_TABLE_NAME` を確認 |
| 単体では通るのに通しで落ちる | テスト間の汚染。PostgreSQL なら `useTransaction` の付け忘れ、DynamoDB なら `clearDynamoTable()` の呼び忘れを疑う |
| タイムアウト（30秒） | LocalStack の起動途中。healthy を待ってから再実行 |

**テスト間の汚染を、実行順への依存や `it.skip` で回避しない。**
分離の仕組み（`useTransaction` / `clearDynamoTable`）が
正しく効いていない箇所を特定して直す。

## Step 5. 報告

- コンテナの状態（起動が必要だったかどうか）
- テスト結果: 成否、テスト数、所要時間
- 失敗があれば、Step 4 の切り分けに沿った原因と直し方

なお、テスト後もコンテナは起動したまま残す（次回が速い）。
落としたい場合のみ `pnpm docker:down` を案内する。
