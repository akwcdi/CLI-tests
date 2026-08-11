---
description: ソースファイルのユニットテストを設計フローに沿って書く
argument-hint: <ソースファイルのパス>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(pnpm test:ut*), Bash(pnpm vitest*)
---

対象ソースファイル: **$1**

このプロジェクトの UT 規約に従って、上記ファイルのユニットテストを書く。
**必ず下の5ステップを順番に実行し、各ステップの結果をユーザーに見せてから次へ進むこと。**
途中でいきなりテストコードを書き始めない。

## 前提（このプロジェクトの UT 規約）

- フレームワークは Vitest。設定は `vitest.config.ts`。
- テストの置き場所は **対象と同じパッケージの `tests/` 配下**、
  ファイル名は `<対象ファイル名>.test.ts`（React なら `.test.tsx`）。
  例: `packages/core/src/user.ts` → `packages/core/tests/user.test.ts`
- React コンポーネントの場合はファイル冒頭に
  `// @vitest-environment jsdom` を書き、`packages/web/tests/helpers.tsx` を
  import する（`globals: false` のため自動クリーンアップが登録されず、
  これを経由しないと前のテストの DOM が残る）。
- **UT は Docker も DB も LocalStack も使わない。** 外部 I/O は必ずモックする。
  DB が必要になる検証は UT ではなく IT の担当（`/it-write` を使う）。
- カバレッジ閾値は lines / branches / functions / statements すべて **100%**。
- `globals: false` なので `describe` / `it` / `expect` / `vi` は
  `vitest` から明示的に import する。
- テスト名は日本語で、「何をしたら何が起きるか」がわかる文にする。

---

## Step 1. アルゴリズム分析

`$1` を読み、次を表にまとめて提示する。

| エクスポート | 種別 | 入力 | 出力 | 分岐・例外 |
|---|---|---|---|---|

洗い出す対象:

- すべてのエクスポート（関数・クラス・クラスの各メソッド）
- **すべての分岐**: `if` / 三項 / `&&` / `||` / `??` / `switch` / `try-catch` /
  デフォルト引数 / オプショナルチェーン
- throw される例外の種類と条件
- 境界値（0、空文字、空配列、最大長ちょうど、最大長 +1、null、undefined）

branches 100% の壁になるのはたいてい `??` とデフォルト引数の**未指定側**。
ここを取りこぼさないこと。

## Step 2. モック戦略

外部依存を列挙し、それぞれどうモックするかを決めて提示する。

| 依存 | モック方法 | 理由 |
|---|---|---|

判断の基準:

- **引数で注入されている依存**（`Queryable`、`DynamoDBDocumentClient` など）は
  `vi.fn()` で作ったテストダブルを渡す。`vi.mock()` は使わない。
  （既存の `packages/core/tests/user-repository.test.ts` の `createDb()`、
  `packages/core/tests/event-store.test.ts` の `createClient()` が手本）
- **import で直接掴んでいる依存**のみ `vi.mock()` を使う。
  ただし、まず「引数で受け取る形に変えられないか」を検討し、
  変えられるなら**プロダクトコード側の設計を直す提案をする**。
- 時刻・乱数・UUID は `vi.useFakeTimers()` や `vi.spyOn` で固定する。
- React では `fetch` を直接叩かず、`api` モジュールごと `vi.mock` する
  （`packages/web/tests/helpers.tsx` の `apiMock` が手本）。
- `clearMocks` / `restoreMocks` は設定済みなので、手動リセットは不要。

## Step 3. テストケース表

実装前に、書くテストを表で提示してユーザーの確認を取る。

| # | describe | テスト名 | 入力 | 期待結果 | 対応する分岐 |
|---|---|---|---|---|---|

- Step 1 で挙げた分岐が **1つ残らず** どれかの行に紐づいていること。
  紐づいていない分岐があれば、その時点で指摘する。
- 同じ構造で入力だけ違うケースは `it.each` にまとめる。

## Step 4. 実装

確認が取れたらテストファイルを書く。

- 1テスト1観点。1つの `it` に無関係な assert を詰め込まない。
- 期待値はベタ書きする。プロダクトコードのロジックをテスト側で再計算しない。
- `expect(...).toHaveBeenCalledWith(...)` で**呼ばれ方**まで検証する
  （SQL の形、コマンドの種類、渡したパラメータ）。
- モック生成やフィクスチャはファイル冒頭のヘルパー関数にまとめる。

## Step 5. カバレッジ確認

```bash
pnpm test:ut
```

を実行し、結果に応じて対応する。

- **100% 未満**: 未カバー行を特定し、Step 3 の表に不足ケースを追加して実装し直す。
  カバレッジを満たすためだけの意味のないテストは書かない。
  到達不能なコードが原因なら、**そのコードを消す**提案をする。
- **`coverage.exclude` への追加で解決しようとしない。**
  除外が許されるのは `src/index.ts` / `src/types.ts` / `src/config.ts` / `src/db.ts` の4つだけ。
  それ以外を除外したくなったら、テストしにくいロジックが
  設計上まずい場所にある合図なので、切り出しを提案する。

最後に、追加したファイルと最終カバレッジを報告する。
