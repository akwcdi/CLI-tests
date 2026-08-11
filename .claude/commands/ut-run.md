---
description: UT を実行し、coverage.exclude の違反を監査する
allowed-tools: Read, Grep, Glob, Bash(pnpm test:ut*), Bash(git diff*), Bash(git log*)
---

UT を実行し、あわせて **`coverage.exclude` が規約どおりか監査する**。
$ARGUMENTS

## Step 1. 実行

```bash
pnpm test:ut
```

UT は Docker も DB も使わないので、事前準備は不要。

## Step 2. exclude 監査

`vitest.config.ts` の `test.coverage.exclude` を読み、
**次の4パターン以外が含まれていないか**を確認する。

| 許可されるパターン | 理由 |
|---|---|
| `packages/*/src/index.ts` | エントリポイント（再エクスポートのみ） |
| `packages/*/src/index.tsx` | ブラウザ側エントリポイント（マウントのみ） |
| `packages/*/src/types.ts` | 型定義（実行時コードなし） |
| `packages/*/src/config.ts` | 設定値の読み出し |
| `packages/*/src/db.ts` | DB / AWS クライアントの接続初期化 |

**これ以外のエントリが1つでもあれば違反として報告する。**
`coverage.include` が `packages/*/src/**/*.ts` と
`packages/*/src/**/*.tsx` の2つから狭められている場合、
それも実質的な除外なので同様に違反として扱う。

`src/` の外に置かれたプロダクトコードも実質的な除外にあたる。
現状で認められているのは `packages/app/server.ts` だけで、
これは「import しただけでポートを掴まない」ためにそうしている。
`src/` の外に新しいロジックが増えていたら違反として報告する。

違反を見つけたら、次を報告する。

- どのパターンが増えているか
- それが増えた理由の推測（テストしにくいロジックが混ざっている等）
- **正しい直し方**: exclude を消し、ロジックを別ファイルへ切り出して
  `/ut-write` でテストを書く

exclude を増やす方向の提案はしない。

## Step 3. 許可ファイルの中身検査

許可された4ファイルが、**本当にその役割しか持っていないか**を確認する。
名前が合っていても中身にロジックがあれば、除外は不当になる。

各ファイルを読み、次があれば違反として報告する。

- `index.ts` に再エクスポート以外の処理がある
- `types.ts` に実行時コード（`const`、関数、`enum`、クラス）がある
- `config.ts` に条件分岐や値の加工がある（`??` による既定値までは可）
- `db.ts` に接続オブジェクトの生成以外の処理がある
- `index.tsx` にマウント以外の処理がある
- `packages/app/server.ts` に起動と静的配信の設定以外の処理がある

## Step 4. 報告

次の形でまとめる。

- **テスト結果**: 成否、テスト数
- **カバレッジ**: lines / branches / functions / statements の実数値
  （閾値は4項目すべて 100%）
- **exclude 監査**: OK、または違反の一覧と直し方
- **未カバー箇所**: あればファイルと行番号、そこを通すのに必要なケース

カバレッジが 100% 未満のとき、**exclude への追加は解決策として提示しない。**
不足しているテストケースを具体的に挙げる。
