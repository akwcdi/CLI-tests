// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeRequest, makeUser } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { App } = await import('../src/App.tsx');

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.me.mockResolvedValue(makeUser());
  apiMock.listUsers.mockResolvedValue({ items: [], nextCursor: null });
  apiMock.getUser.mockResolvedValue(makeUser());
  apiMock.listEvents.mockResolvedValue({ items: [], nextCursor: null });
});

const renderApp = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('App のルーティング', () => {
  it('/login はログイン画面', () => {
    renderApp('/login');

    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
    // ログイン画面はセッション確認をしない。
    expect(apiMock.me).not.toHaveBeenCalled();
  });

  it('/users は認証を確認してから一覧を出す', async () => {
    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'ユーザー一覧' })).toBeInTheDocument();
    expect(apiMock.me).toHaveBeenCalled();
  });

  it('/users/:id は認証を確認してから詳細を出す', async () => {
    apiMock.getUser.mockResolvedValue(makeUser({ name: 'Taro' }));

    renderApp('/users/u1');

    expect(await screen.findByRole('heading', { name: 'Taro' })).toBeInTheDocument();
    expect(apiMock.getUser).toHaveBeenCalledWith('u1');
  });

  it('未知のパスはアプリトップへリダイレクトする', async () => {
    apiMock.overview.mockResolvedValue({ users: 3, pendingRequests: 1 });

    renderApp('/no-such-page');

    expect(await screen.findByRole('heading', { name: /さん/ })).toBeInTheDocument();
  });

  it('/ はアプリトップ', async () => {
    apiMock.overview.mockResolvedValue({ users: 3, pendingRequests: 1 });

    renderApp('/');

    expect(await screen.findByRole('link', { name: /ユーザー管理/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /申請管理/ })).toBeInTheDocument();
  });

  it('/requests は申請一覧', async () => {
    apiMock.listRequests.mockResolvedValue({ items: [], nextCursor: null });

    renderApp('/requests');

    expect(await screen.findByRole('heading', { name: '申請' })).toBeInTheDocument();
  });

  it('/requests/:id は申請詳細', async () => {
    apiMock.getRequest.mockResolvedValue(makeRequest({ title: '備品購入' }));
    apiMock.listRequestEvents.mockResolvedValue({ items: [], nextCursor: null });

    renderApp('/requests/r1');

    expect(await screen.findByRole('heading', { name: '備品購入' })).toBeInTheDocument();
    expect(apiMock.getRequest).toHaveBeenCalledWith('r1');
  });

  it('未認証で保護されたパスを開くとログイン画面になる', async () => {
    apiMock.me.mockRejectedValue(new Error('401'));

    renderApp('/users');

    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
  });
});
