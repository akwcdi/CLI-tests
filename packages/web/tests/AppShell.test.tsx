// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeUser, renderInShell } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { AppShell } = await import('../src/components/AppShell.tsx');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppShell', () => {
  it('製品名と本文を出し、現在地は省略できる', async () => {
    await renderInShell(<AppShell>本文</AppShell>);

    expect(screen.getByRole('link', { name: /オペレーション基盤/ })).toBeInTheDocument();
    expect(screen.getByText('本文')).toBeInTheDocument();
    expect(screen.queryByText('ユーザー管理')).not.toBeInTheDocument();
  });

  it('title を渡すと現在地として出る', async () => {
    await renderInShell(<AppShell title="ユーザー管理">本文</AppShell>);

    expect(screen.getByText('ユーザー管理')).toBeInTheDocument();
  });

  it('サインイン中のユーザーを右上に出す', async () => {
    await renderInShell(
      <AppShell>本文</AppShell>,
      '/',
      '/',
      makeUser({ name: '田中 太郎', email: 'tanaka@example.com' }),
    );

    expect(screen.getByRole('button', { name: /田中 太郎/ })).toBeInTheDocument();
  });

  it('メニューからサインアウトするとログイン画面へ遷移する', async () => {
    apiMock.logout.mockResolvedValue(undefined);
    await renderInShell(<AppShell>本文</AppShell>);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /サインイン中の人/ }));
    await user.click(screen.getByRole('menuitem', { name: 'サインアウト' }));

    expect(apiMock.logout).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('ログイン画面')).toBeInTheDocument();
    });
  });
});
