// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeUser, renderInShell } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { ApiError } = await import('../src/api.ts');
const { UsersPage } = await import('../src/pages/UsersPage.tsx');

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listUsers.mockResolvedValue({ items: [], nextCursor: null });
});

/** 一覧の読み込みが終わるまで待つ。 */
const settled = () => screen.findByRole('table');

async function fillCreateForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
  await user.type(screen.getByLabelText('名前'), 'Hanako');
  await user.type(screen.getByLabelText('パスワード'), 'password123');
  return user;
}

describe('UsersPage 一覧', () => {
  it('取得した行を表示する', async () => {
    apiMock.listUsers.mockResolvedValue({
      items: [makeUser({ id: 'u1', name: 'Taro', status: 'active' })],
      nextCursor: null,
    });

    await renderInShell(<UsersPage />);

    const table = await settled();
    expect(within(table).getByText('Taro')).toBeInTheDocument();
    expect(within(table).getByText('有効')).toBeInTheDocument();
    expect(apiMock.listUsers).toHaveBeenCalledWith({ limit: 5, cursor: null });
  });

  it('停止中の状態はラベルを変えて表示する', async () => {
    apiMock.listUsers.mockResolvedValue({
      items: [makeUser({ status: 'suspended' })],
      nextCursor: null,
    });

    await renderInShell(<UsersPage />);

    expect(within(await settled()).getByText('停止中')).toBeInTheDocument();
  });

  it('取得に失敗するとエラーを表示する', async () => {
    apiMock.listUsers.mockRejectedValue(
      new ApiError(500, { code: 'internal_error', message: 'internal server error' }),
    );

    await renderInShell(<UsersPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('internal server error');
  });
});

describe('UsersPage ページング', () => {
  it('次ページが無ければ「次へ」は押せない', async () => {
    await renderInShell(<UsersPage />);
    await settled();

    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '先頭へ' })).toBeDisabled();
  });

  it('「次へ」でカーソルを渡して再取得し、「先頭へ」で戻る', async () => {
    apiMock.listUsers
      .mockResolvedValueOnce({ items: [makeUser({ id: 'u1' })], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [makeUser({ id: 'u2' })], nextCursor: null })
      .mockResolvedValueOnce({ items: [makeUser({ id: 'u1' })], nextCursor: 'c1' });
    const user = userEvent.setup();

    await renderInShell(<UsersPage />);
    await settled();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => {
      expect(apiMock.listUsers).toHaveBeenLastCalledWith({ limit: 5, cursor: 'c1' });
    });

    await user.click(screen.getByRole('button', { name: '先頭へ' }));
    await waitFor(() => {
      expect(apiMock.listUsers).toHaveBeenLastCalledWith({ limit: 5, cursor: null });
    });
  });
});

describe('UsersPage 新規作成', () => {
  it('作成後にフォームを空にして一覧を取り直す', async () => {
    apiMock.createUser.mockResolvedValue(makeUser({ id: 'u2' }));

    await renderInShell(<UsersPage />);
    await settled();
    const user = await fillCreateForm();
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(apiMock.createUser).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'Hanako',
        password: 'password123',
      });
    });
    expect(screen.getByLabelText('メールアドレス')).toHaveValue('');
    // 初回 + 作成後の再取得。
    expect(apiMock.listUsers).toHaveBeenCalledTimes(2);
  });

  it('2ページ目で作成したら先頭ページに戻る', async () => {
    apiMock.listUsers
      .mockResolvedValueOnce({ items: [makeUser({ id: 'u1' })], nextCursor: 'c1' })
      .mockResolvedValue({ items: [makeUser({ id: 'u2' })], nextCursor: null });
    apiMock.createUser.mockResolvedValue(makeUser({ id: 'u3' }));

    await renderInShell(<UsersPage />);
    await settled();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => {
      expect(apiMock.listUsers).toHaveBeenLastCalledWith({ limit: 5, cursor: 'c1' });
    });

    await fillCreateForm();
    await user.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => {
      expect(apiMock.listUsers).toHaveBeenLastCalledWith({ limit: 5, cursor: null });
    });
  });

  it('重複メールなどのエラーを表示し、一覧は取り直さない', async () => {
    apiMock.createUser.mockRejectedValue(
      new ApiError(400, {
        code: 'validation_error',
        message: 'email already registered: dup@example.com',
        field: 'email',
      }),
    );

    await renderInShell(<UsersPage />);
    await settled();
    const user = await fillCreateForm();
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('email already registered');
    expect(apiMock.listUsers).toHaveBeenCalledTimes(1);
  });

  it('送信中は作成ボタンを無効にする', async () => {
    let resolve: (value: unknown) => void = () => {};
    apiMock.createUser.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    await renderInShell(<UsersPage />);
    await settled();
    const user = await fillCreateForm();
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(screen.getByRole('button', { name: '作成' })).toBeDisabled();

    resolve(makeUser());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '作成' })).toBeEnabled();
    });
  });
});

