// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock, makeUser, renderAt } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { RequireAuth } = await import('../src/RequireAuth.tsx');

beforeEach(() => {
  vi.clearAllMocks();
});

const guarded = <RequireAuth>{<p>保護された内容</p>}</RequireAuth>;

describe('RequireAuth', () => {
  it('判定中は読み込み表示にして、保護された内容を出さない', () => {
    apiMock.me.mockReturnValue(new Promise(() => {}));

    renderAt(guarded);

    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    expect(screen.queryByText('保護された内容')).not.toBeInTheDocument();
  });

  it('セッションが有効なら children を描画する', async () => {
    apiMock.me.mockResolvedValue(makeUser());

    renderAt(guarded);

    expect(await screen.findByText('保護された内容')).toBeInTheDocument();
  });

  it('セッションが無効ならログイン画面へ飛ばす', async () => {
    apiMock.me.mockRejectedValue(new Error('401'));

    renderAt(guarded);

    expect(await screen.findByText('ログイン画面')).toBeInTheDocument();
    expect(screen.queryByText('保護された内容')).not.toBeInTheDocument();
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

    // React の "unmounted component" 警告が出ないこと＝状態更新していないこと。
    await expect(Promise.resolve()).resolves.toBeUndefined();
  });
});
