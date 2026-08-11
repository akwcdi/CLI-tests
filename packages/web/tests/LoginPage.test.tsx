// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeUser, renderAt } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { ApiError } = await import('../src/api.ts');
const { LoginPage } = await import('../src/pages/LoginPage.tsx');

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('メールアドレス'), 'admin@example.com');
  await user.type(screen.getByLabelText('パスワード'), 'password123');
  await user.click(screen.getByRole('button', { name: 'ログイン' }));
}

describe('LoginPage', () => {
  it('入力欄と送信ボタンを表示する', () => {
    renderAt(<LoginPage />, '/login', '/login');

    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('入力した資格情報で login を呼び、アプリトップへ遷移する', async () => {
    apiMock.login.mockResolvedValue(makeUser());

    renderAt(<LoginPage />, '/login', '/login');
    await fillAndSubmit();

    expect(apiMock.login).toHaveBeenCalledWith('admin@example.com', 'password123');
    expect(await screen.findByText('アプリトップ')).toBeInTheDocument();
  });

  it('認証に失敗するとサーバーの文言を表示し、遷移しない', async () => {
    apiMock.login.mockRejectedValue(
      new ApiError(401, { code: 'unauthorized', message: 'email or password is incorrect' }),
    );

    renderAt(<LoginPage />, '/login', '/login');
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('email or password is incorrect');
    expect(screen.queryByText('アプリトップ')).not.toBeInTheDocument();
  });

  it('想定外の例外では汎用の文言を出す', async () => {
    apiMock.login.mockRejectedValue(new TypeError('Failed to fetch'));

    renderAt(<LoginPage />, '/login', '/login');
    await fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('予期しないエラーが発生しました');
  });

  it('送信中はボタンを無効にし、終わったら戻す', async () => {
    let resolve: (value: unknown) => void = () => {};
    apiMock.login.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    renderAt(<LoginPage />, '/login', '/login');
    await fillAndSubmit();

    const button = screen.getByRole('button', { name: 'ログイン' });
    expect(button).toBeDisabled();

    resolve(makeUser());
    await waitFor(() => {
      expect(screen.getByText('アプリトップ')).toBeInTheDocument();
    });
  });
});
