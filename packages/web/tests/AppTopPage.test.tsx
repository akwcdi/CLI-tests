// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeUser, renderInShell } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { ApiError } = await import('../src/api.ts');
const { AppTopPage } = await import('../src/pages/AppTopPage.tsx');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppTopPage', () => {
  it('サインイン中の名前で迎え、2つのアプリを並べる', async () => {
    apiMock.overview.mockResolvedValue({ users: 12, pendingRequests: 3 });

    await renderInShell(<AppTopPage />, '/', '/', makeUser({ name: '田中 太郎' }));

    expect(await screen.findByRole('heading', { name: '田中 太郎 さん' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ユーザー管理/ })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: /申請管理/ })).toHaveAttribute('href', '/requests');
  });

  it('件数を取得して表示する', async () => {
    apiMock.overview.mockResolvedValue({ users: 12, pendingRequests: 3 });

    await renderInShell(<AppTopPage />);

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('取得できるまではダッシュを出す', async () => {
    apiMock.overview.mockReturnValue(new Promise(() => {}));

    await renderInShell(<AppTopPage />);

    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('取得に失敗してもアプリの一覧は出し、理由を添える', async () => {
    apiMock.overview.mockRejectedValue(
      new ApiError(500, { code: 'internal_error', message: 'internal server error' }),
    );

    await renderInShell(<AppTopPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('internal server error');
    expect(screen.getByRole('link', { name: /ユーザー管理/ })).toBeInTheDocument();
  });

  it('解決前にアンマウントされたら状態を更新しない', async () => {
    let resolve: (value: unknown) => void = () => {};
    apiMock.overview.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { unmount } = await renderInShell(<AppTopPage />);
    unmount();
    resolve({ users: 1, pendingRequests: 1 });

    await expect(Promise.resolve()).resolves.toBeUndefined();
  });

  it('失敗が解決前のアンマウント後に来ても状態を更新しない', async () => {
    let reject: (reason: unknown) => void = () => {};
    apiMock.overview.mockReturnValue(
      new Promise((_r, rej) => {
        reject = rej;
      }),
    );

    const { unmount } = await renderInShell(<AppTopPage />);
    unmount();
    reject(new Error('boom'));

    await expect(Promise.resolve()).resolves.toBeUndefined();
  });
});
