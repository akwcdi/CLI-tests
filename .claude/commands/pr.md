---
description: いまのブランチから Pull Request を作る
argument-hint: [PR に補足したい背景・レビュー観点があれば]
allowed-tools: Read, Grep, Glob, Bash(git status*), Bash(git log*), Bash(git diff*), Bash(git branch*), Bash(git rev-parse*), Bash(git remote*), Bash(git push*), Bash(gh pr*), Bash(gh auth*), Bash(gh repo*)
---

いまのブランチの内容で PR を作る。
ユーザーからの補足: $ARGUMENTS

コミットがまだなら先に `/commit` を使う。**この手順ではコミットしない。**

## 前提（このリポジトリの PR 規約）

- **タイトルは日本語**。50字程度まで。末尾に句点を打たない。
  `feat:` のような接頭辞は付けない。ファイル名やパスを入れない。
  コミット件名は英語だが、**訳して流用しない。** 粒度が違う。
  コミットは1つの変更を、PR はその束を指すので、PR 全体を1行で
  言い直す。

  | 避ける | 書く |
  |---|---|
  | ページング修正 | 一覧の表を1ページずつ戻れるようにする |
  | UsersPage.tsx の改修 | ユーザー一覧の絞り込みを状態別にする |
  | feat: 前へボタン追加 | コミットと PR の書き方をスキルにする |

  体言止めでも「〜する」でもよいが、1本の PR 内で揺らさない。
- **本文も日本語**。`##` で節に分ける。
- 本文はコミットメッセージの貼り直しではない。コミットは「なぜこの変更が
  必要か」を書く場所、PR は **「レビュアーがどこから読み、何を確かめれば
  よいか」** を書く場所。
- 検証結果は実測値。走らせていないものは「未実行」と理由を明記する。
- 末尾に次を置く。

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Step 1. 前提を確認する

```bash
git rev-parse --abbrev-ref HEAD
git status --short
git log --oneline main..HEAD
```

- ブランチが `main` なら PR は作れない。`/commit` に戻る。
- **未コミットの変更が残っていたら進まない。** 取り込むのか外すのかを
  ユーザーに確認する。
- `main..HEAD` が空なら、コミットが無いので報告して終わる。
- 既に PR があるなら**新しく作らない**。`gh pr view` で確認し、
  `gh pr edit --body` で本文を更新する（Step 4 の形は同じ）。

```bash
gh pr view --json number,url,state 2>/dev/null
```

## Step 2. 差分を読む

```bash
git log --format='%n===== %h%n%B' main..HEAD
git diff main...HEAD --stat
```

コミット本文に書いた「なぜ」はここで回収できる。**PR 本文で書き直す
必要は無い。** 要約し、レビュー観点に翻訳する。

## Step 3. push する

```bash
git push -u origin <branch>
```

SSH 鍵が読めない環境では `Permission denied (publickey)` になる。
その場合は `gh` のトークンで HTTPS に載せ替える。

```bash
git -c credential.helper='!gh auth git-credential' \
  push -u https://github.com/<owner>/<repo>.git <branch>
```

**`origin` の URL は書き換えない。** `-c` でその場限りに留める。
この方法を使ったら、最後の報告でユーザーに伝える（upstream が HTTPS で
設定されるため）。

## Step 4. 本文を書く

節はこの順。中身が無い節は省いてよいが、順序は入れ替えない。

1. **冒頭1〜2文**: 何をする PR か。ここだけ読んで判断できる粒度で。
2. **問題**: 変更前に何が起きていたか。症状から書く。
3. **判断**: なぜこの直し方か。**採らなかった選択肢とその理由**。
   レビューで最初に問われるのはここなので省かない。
4. **変更点**: 箇条書き。ファイル名の羅列ではなく、振る舞いの変化を書く。
5. **検証**: 実測値。UT / IT / E2E の件数、カバレッジ、typecheck。
   未実行のものは理由とともに明記する。
6. **残した穴・レビュー観点**: 既知の制約、判断に迷った箇所、
   特に見てほしいファイル。

**書かないもの**

- コミット本文の全文コピー
- 変更ファイル一覧（差分タブで足りる）
- 実行していないテストの結果
- 「LGTM お願いします」のような中身の無い依頼

## Step 5. 作る

タイトルと本文をユーザーに見せ、承認を得てから実行する。

```bash
gh pr create --base main --head <branch> --title "<タイトル>" --body "$(cat <<'EOF'
<本文>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

本文はヒアドキュメントで渡す。`--body` に直接長い文字列を並べると
バッククォートやドル記号がシェルに食われる。

ドラフトにしたい場合だけ `--draft` を付ける。既定では付けない。

## Step 6. 報告

- PR の URL
- タイトルと、本文の節構成
- 未実行の検証があればその一覧
- Step 3 で HTTPS に載せ替えたなら、その事実と戻し方
  （`git branch --unset-upstream`）
