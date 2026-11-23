import { describe, expect, it } from 'vitest';

import { extractInventory, type SourceFile } from '../inventory.ts';

const APP = `
  import { Route } from 'react-router-dom';
  export const App = () => (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/users" element={guarded(<UsersPage />)} />
      <Route path="/users/new" element={guarded(<NewPage />)} />
      <Route path="/users/:id" element={guarded(<DetailPage />)} />
    </Routes>
  );
`;
const CLIENT = `
  export const api = {
    async createUser(input) {
      return request('/api/users', jsonInit('POST', input));
    },
    async deleteUser(id) {
      await request(\`/api/users/\${id}\`, { method: 'DELETE' });
    },
    getUser(id) {
      return request(\`/api/users/\${id}\`);
    },
  };
`;
const SERVER = `
  export function createApp() {
    const app = new Hono();
    app.use('/api/users', requireSession(auth));
    app.get('/api/users', handler);
    app.post('/api/users', handler);
    app.delete('/api/users/:id', handler);
    return app;
  }
`;

const files = (screen: string): SourceFile[] => [
  { path: 'packages/web/src/App.tsx', text: APP },
  { path: 'packages/web/src/api.ts', text: CLIENT },
  { path: 'packages/app/src/app.ts', text: SERVER },
  { path: 'packages/web/src/pages/Screen.tsx', text: screen },
];

const extract = (screen: string) => extractInventory(files(screen));
const keys = (screen: string) => extract(screen).inventory.items.map((item) => item.key);

describe('extractInventory', () => {
  it('ルートと、ガードの付いたルートの権限を抜き出す', () => {
    const found = keys('export const S = () => null;');

    expect(found).toContain('route:/login');
    expect(found).toContain('policy:route#/users');
    expect(found).not.toContain('policy:route#/login');
  });

  it('サーバーの書き込み API だけを抜き出し、GET は数えない', () => {
    const found = keys('export const S = () => null;');

    expect(found).toContain('api:POST /api/users');
    expect(found).toContain('api:DELETE /api/users/:id');
    expect(found).not.toContain('api:GET /api/users');
    expect(found).toContain('policy:api#/api/users');
  });

  it('画面が呼ぶ書き込みだけを clientWrites に入れる', () => {
    expect(extract('export const S = () => null;').inventory.clientWrites).toEqual([
      { method: 'createUser', http: 'POST', path: '/api/users' },
      { method: 'deleteUser', http: 'DELETE', path: '/api/users/:p' },
    ]);
  });

  it('ボタンは表示文字列で、表示が無ければ関数名で名付ける', () => {
    const found = keys(`
      export const S = () => (
        <>
          <button onClick={() => setPage(1)}>先頭へ</button>
          <button onClick={() => void handleOpen()}><span aria-hidden="true">▾</span></button>
          <div data-testid="backdrop" onClick={() => setOpen(false)} />
          <button onClick={() => toggle()}>{on ? '停止する' : '再開する'}</button>
        </>
      );
    `);

    expect(found).toContain('flow:pages/Screen.tsx#ui:先頭へ');
    expect(found).toContain('flow:pages/Screen.tsx#op:handleOpen');
    expect(found).toContain('flow:pages/Screen.tsx#testid:backdrop');
    expect(found).toContain('flow:pages/Screen.tsx#ui:停止する|再開する');
  });

  it('ハンドラから呼ばれる書き込み API を、ローカル関数を辿って記録する', () => {
    const { inventory } = extract(`
      export function S() {
        async function save() { await api.createUser(input); }
        async function act(run) { await run(); }
        return (
          <>
            <form onSubmit={save} />
            <button onClick={() => void act(() => api.deleteUser(id))}>消す</button>
            <button onClick={() => void act(() => api.getUser(id))}>読む</button>
          </>
        );
      }
    `);
    const flow = (suffix: string) =>
      inventory.items.find((item) => item.key === `flow:pages/Screen.tsx#${suffix}`);

    expect(flow('op:save')?.writes).toEqual(['POST /api/users']);
    expect(flow('ui:消す')?.writes).toEqual(['DELETE /api/users/:p']);
    expect(flow('ui:読む')?.writes).toBeUndefined();
  });

  it('入力欄の onChange は flow にせず、surface でだけ数える', () => {
    const { inventory } = extract(`
      export const S = () => (
        <>
          <input onChange={(e) => setName(e.target.value)} />
          <button onClick={save}>保存</button>
          <Child onDone={save} />
        </>
      );
    `);

    const flows = inventory.items.filter((item) => item.kind === 'flow');
    expect(flows.map((item) => item.key)).toEqual(['flow:pages/Screen.tsx#ui:保存']);
    expect(inventory.items.find((item) => item.kind === 'surface')?.handlers).toBe(3);
  });

  it('リンク先をルートのパターンに解決し、静的なルートを優先する', () => {
    const found = keys(`
      export const S = () => (
        <>
          <Link to={\`/users/\${id}\`}>詳細</Link>
          <Link to="/users/new">作成</Link>
          <a href="/users?page=2">一覧</a>
        </>
      );
      navigate('/login');
    `);

    expect(found).toContain('link:pages/Screen.tsx#/users/:id');
    expect(found).toContain('link:pages/Screen.tsx#/users/new');
    expect(found).toContain('link:pages/Screen.tsx#/users');
    expect(found).toContain('link:pages/Screen.tsx#/login');
  });

  it.each([
    ['ルートが無いリンク先', '<Link to="/nowhere">x</Link>', 'リンク先のルートが無い'],
    ['変数に隠したリンク先', '<Link to={target}>x</Link>', 'リンク先を読めない'],
    ['名付けられない操作', '<div onClick={() => { a(); b(); }} />', '名付けられない操作'],
    ['JSX の外のイベント登録', '<div ref={(el) => el.addEventListener("click", f)} />', 'JSX の外のイベント登録'],
  ])('%s は黙って飛ばさずエラーにする', (_label, jsx, message) => {
    const { errors } = extract(`export const S = () => (${jsx});`);

    expect(errors.join('\n')).toContain(message);
  });

  it('外部への通信を external として抜き出す', () => {
    const found = keys(`
      export const S = () => {
        fetch('/api/track');
        navigator.sendBeacon('/x');
        new WebSocket(url);
        return 'https://example.com/hook';
      };
    `);

    expect(found).toContain('external:packages/web/src/pages/Screen.tsx#fetch');
    expect(found).toContain('external:packages/web/src/pages/Screen.tsx#navigator.sendBeacon');
    expect(found).toContain('external:packages/web/src/pages/Screen.tsx#WebSocket');
    expect(found).toContain('external:packages/web/src/pages/Screen.tsx#https://example.com/hook');
  });

  it('api.ts の fetch は外部通信に数えない', () => {
    const { inventory } = extractInventory([
      { path: 'packages/web/src/App.tsx', text: APP },
      { path: 'packages/web/src/api.ts', text: 'export const r = () => fetch("/api/me");' },
    ]);

    expect(inventory.items.filter((item) => item.kind === 'external')).toEqual([]);
  });

  it('HTML から読み込む外部スクリプトも外部通信に数える', () => {
    const { inventory } = extractInventory([
      ...files('export const S = () => null;'),
      {
        path: 'packages/web/index.html',
        text: '<script src="https://cdn.example.com/x.js"></script><script src="/local.js"></script>',
      },
    ]);

    expect(inventory.items.filter((item) => item.kind === 'external').map((item) => item.key)).toEqual([
      'external:packages/web/index.html#https://cdn.example.com/x.js',
    ]);
  });

  it('ルートを 1 つも読めなければエラーにする', () => {
    const { errors } = extractInventory([{ path: 'packages/web/src/api.ts', text: CLIENT }]);

    expect(errors.join('\n')).toContain('ルートを 1 つも抽出できなかった');
  });
});
