// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeUser, renderAt } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { RequireSession, useSession } = await import('../src/session.tsx');

beforeEach(() => {
  vi.clearAllMocks();
});

/** セッションから読んだ名前をそのまま出すだけの確認用。 */
function Whoami() {
  return <p>{useSession().name}</p>;
}

const guarded = (
  <RequireSession>
    <Whoami />
  </RequireSession>
);

describe('RequireSession', () => {
  it('判定中は読み込み表示にして、中身を出さない', () => {
    apiMock.me.mockReturnValue(new Promise(() => {}));

    renderAt(guarded);

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    expect(screen.queryByText('Taro')).not.toBeInTheDocument();
  });

  it('有効ならユーザーを渡して children を描画する', async () => {
    apiMock.me.mockResolvedValue(makeUser({ name: '田中 太郎' }));

    renderAt(guarded);

    expect(await screen.findByText('田中 太郎')).toBeInTheDocument();
  });

  it('無効ならログイン画面へ飛ばす', async () => {
    apiMock.me.mockRejectedValue(new Error('401'));

    renderAt(guarded);

    expect(await screen.findByText('ログイン画面')).toBeInTheDocument();
  });

  it.each([
    ['成功', (r: (v: unknown) => void) => r(makeUser())],
    ['失敗', (_r: (v: unknown) => void, j: (e: unknown) => void) => j(new Error('401'))],
  ])('解決前にアンマウントされたら状態を更新しない: %s', async (_label, settle) => {
    let resolve: (value: unknown) => void = () => {};
    let reject: (reason: unknown) => void = () => {};
    apiMock.me.mockReturnValue(
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      }),
    );

    const { unmount } = renderAt(guarded);
    unmount();
    settle(resolve, reject);

    await expect(Promise.resolve()).resolves.toBeUndefined();
  });
});

describe('useSession', () => {
  it('RequireSession の外で呼ぶと、原因の分かる例外になる', () => {
    // React が投げる console.error は抑える。落ちること自体が期待値。
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<Whoami />)).toThrow(/RequireSession の内側で呼んでください/);
    } finally {
      spy.mockRestore();
    }
  });
});
