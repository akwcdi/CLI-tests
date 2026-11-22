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
| `@test/core` | ドメイン。users / requests(PostgreSQL) と events(DynamoDB)、認証 |
| `@test/app` | Hono の API。すべての変更操作が DynamoDB にイベントを書く |
| `@test/web` | React + Vite の管理コンソール |
| `@test/e2e` | Playwright |

## アプリ構成

サインイン後の着地点はアプリトップ（`/`）で、そこから各アプリに入る。

| アプリ | 経路 | 役割 |
|---|---|---|
| ユーザー管理 | `/users` | **一般層**。ここに登録された人が、ほかのアプリの申請者・決裁者になる |
| 申請管理 | `/requests` | 金額をともなう申請の提出と決裁。下書き → 承認待ち → 承認/却下 |

申請の作成は一覧ではなく `/requests/new` の別画面に置く。項目が増えても一覧を
圧迫せず、作成の失敗を一覧の取得失敗と混ぜないため。作ったあとは提出へ続けられる
よう、一覧ではなくその申請の詳細に着く。

申請の決裁は申請者本人にはできない。この規則は core が持ち、API・画面・E2E の
それぞれで確かめている。

## 画面のデザイン

`packages/web/src/styles.css` に全体が入っている。決めごとが2つある。

1. **型の規則** — 機械が生んだ値（ID・日時・金額・件数）は等幅、人が書いた文
   （氏名・件名）は可変幅。書体だけで出どころが判別できる。
2. **状態レール** — 行とカードの左端 3px。色に加えて質感で状態を表す。
   実線 = 確定、破線 = 進行中、斜線 = 停止・却下。色覚に依存せず、
   表を端から眺めるだけで状態分布が掴める。詳細画面ではこれが拡大されて
   監査履歴の軸になる。

新しい状態を足すときは `packages/web/src/status.ts` の `Tone` に寄せる。
色名ではなく意味で名前が付いているので、表示側を触らずに済む。

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

Chromium の PC（`pc`）とモバイル（`mobile`）の2プロジェクトで回す。
全テストが1つの DB を共有するので直列（`workers: 1`）。CI では `retries: 1`。

外部で起動済みのアプリに向けたい場合は `E2E_BASE_URL` を設定する。
そのときアプリの起動もシードも片付けもこちらでは行わない。

```bash
E2E_BASE_URL=http://localhost:8080 pnpm test:e2e
```

### 環境の分離

DB・テーブル・ポートは作業ツリーのパスから決める（`db_e2e_<id>` /
`events_e2e_<id>` / 3100〜3899）。worktree を並べて同時に回しても衝突せず、
`pnpm dev` の 3000 にも繋がらない。終わると DB とテーブルを消し、レポートは残す。
`E2E_KEEP=1` で DB を残せる。コンテナは IT と共用する。

ポートが使用中なら起動時に落ちる。`E2E_PORT` で逃がす。

### 対応表

「どの実装を、どのシナリオで確かめるか」を `packages/e2e/ledger/` に置く。

| ファイル | 中身 | 更新方法 |
|---|---|---|
| `inventory.generated.json` | ソースから抜き出した対象（route / api / flow / link / policy / surface / external） | `pnpm --filter @test/e2e ledger --write` |
| `scenarios.json` | シナリオ。`covers` に対象、`aspects` に観点を書く | 手で書く |
| `exceptions.json` | 確かめなくてよい観点と、その理由 | 手で書く |
| `pending-baseline.json` | 導入時に残っている不足。項目単位で持ち、増やせない | 減らすだけ |
| `surfaces.json` | 画面ごとのハンドラ数 | シナリオを見直してから手で更新 |

テストにはシナリオ ID をタグで付ける（`{ tag: '@USER-004' }`）。

`pnpm check:e2e` が次を照合する。ブラウザも Docker も要らず、CI では PR ごとに走る。

- inventory がソースと一致し、読めない式が無いこと
- 全ての対象と必須観点が、実装済みシナリオ・理由付きの例外・baseline のどれかにあること
- シナリオとテストが過不足なく対応し、PC とモバイルの両方を対象にしていること
- 消えた対象への参照、不要な例外、満たされた baseline が残っていないこと
- ハンドラ数が確認済みの値と一致すること
- 画面が呼ぶ書き込み API とサーバーの定義が一致すること
- `test.skip` / `only` / `fixme` が無いこと
- baseline が base ブランチより増えていないこと（`--base <ref>`）

必須観点は、種類で決まる。

| 対象 | 必須観点 |
|---|---|
| route / link | `normal` |
| 書き込みをしない flow | `normal` |
| 書き込みをする flow / api | `normal` `persist` `invalid` |
| policy | `denied` |

### テストの書き方

操作手順ではなく、仕様上どうなれば正しいかを書く。

- 保存系は、開き直しても値が残っていることまで見る（`persist`）
- 不正な入力は、エラー表示に加えて保存されていないことも見る（`invalid`）
- 画面から行う保存を、API の直接呼び出しで確かめたことにしない。API を
  直接呼ぶのは、権限の確認と、検証したいこと以外の準備だけにする
- 今の実装の挙動を正解にしない。仕様が実装と食い違っていたら、テストを
  合わせず `pending` に理由を書いて報告する
- `test` は `tests/fixtures.ts` から使う。アプリの外への通信を止め、発生したら落とす
- 計算の端数や入力の組み合わせは UT / IT に任せる。E2E を厚くしても下の層は薄くしない

### 回す範囲

```bash
pnpm test:e2e:changed          # origin/main との差分に関係するシナリオだけ
pnpm test:e2e:changed <ref>    # 比較先を指定
pnpm test:e2e                  # 全シナリオ。大きなリファクタや PR の前に
pnpm --filter @test/e2e results  # 直前の結果を要約する。PR の検証欄に貼る
```

画面ファイルの変更はそれを指すシナリオだけを選び、API・core・共通処理の変更は
全シナリオに倒す。`results` はスキップを成功に数えず、失敗と未実施を分けて出す。
CI は PR ごとに全シナリオを回す（`results --all`）。

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
