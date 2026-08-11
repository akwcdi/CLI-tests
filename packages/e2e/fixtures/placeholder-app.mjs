/**
 * E2E の足場を成立させるためのプレースホルダアプリ。
 *
 * **これはテスト対象ではない。** 実アプリができたら差し替える前提の仮置きで、
 * ログイン → セッション Cookie 発行 → 保護されたページ という
 * E2E が最低限必要とする形だけを持っている。
 *
 * 実アプリに向ける場合はこのファイルを使わず、`E2E_BASE_URL` を設定する。
 * そのとき playwright.config.ts はこのサーバーを起動しない。
 *
 *   E2E_BASE_URL=http://localhost:8080 pnpm test:e2e
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3000);

const page = (body) =>
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>placeholder</title></head><body>${body}</body></html>`;

const loginPage = page(`
  <h1>ログイン</h1>
  <form method="POST" action="/login">
    <label for="email">メールアドレス</label>
    <input id="email" name="email" type="email" autocomplete="username">
    <label for="password">パスワード</label>
    <input id="password" name="password" type="password" autocomplete="current-password">
    <button type="submit">ログイン</button>
  </form>
`);

const dashboardPage = page('<h1>ダッシュボード</h1>');

const isAuthed = (req) => (req.headers.cookie ?? '').includes('session=ok');

const html = (res, body) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
};

const redirect = (res, location, headers = {}) => {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
};

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (pathname === '/login' && req.method === 'POST') {
    // 入力値は検証しない。セッションの受け渡しを成立させるだけ。
    redirect(res, '/dashboard', { 'Set-Cookie': 'session=ok; Path=/; HttpOnly; SameSite=Lax' });
    return;
  }

  if (pathname === '/login') {
    html(res, loginPage);
    return;
  }

  if (pathname === '/dashboard') {
    if (!isAuthed(req)) {
      redirect(res, '/login');
      return;
    }
    html(res, dashboardPage);
    return;
  }

  redirect(res, isAuthed(req) ? '/dashboard' : '/login');
});

server.listen(PORT, () => {
  console.log(`placeholder app listening on http://localhost:${PORT}`);
});
