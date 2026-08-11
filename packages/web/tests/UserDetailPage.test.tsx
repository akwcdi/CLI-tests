// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock, makeEvent, makeUser, renderAt } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { ApiError } = await import('../src/api.ts');
const { UserDetailPage } = await import('../src/pages/UserDetailPage.tsx');

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getUser.mockResolvedValue(makeUser());
  apiMock.listEvents.mockResolvedValue({ items: [], nextCursor: null });
});

/** /users/u1 として描画する。 */
const renderDetail = () => renderAt(<UserDetailPage />, '/users/u1', '/users/:id');

describe('UserDetailPage 表示', () => {
  it('読み込み中を出したあと、プロフィールと履歴を表示する', async () => {
    apiMock.getUser.mockResolvedValue(makeUser({ name: 'Taro', email: 'taro@example.com' }));
    apiMock.listEvents.mockResolvedValue({
      items: [makeEvent({ type: 'user.created' }), makeEvent({ type: 'user.logged_in' })],
      nextCursor: null,
    });

    renderDetail();
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Taro' })).toBeInTheDocument();
    expect(screen.getByText('taro@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('有効');
    expect(screen.getByText(/user\.created/)).toBeInTheDocument();
    expect(screen.getByText(/user\.logged_in/)).toBeInTheDocument();

    expect(apiMock.getUser).toHaveBeenCalledWith('u1');
    expect(apiMock.listEvents).toHaveBeenCalledWith('u1');
  });

  it('履歴が無ければその旨を出す', async () => {
    renderDetail();

    expect(await screen.findByText('履歴はありません')).toBeInTheDocument();
  });

  it('停止中のユーザーはラベルとボタンが変わる', async () => {
    apiMock.getUser.mockResolvedValue(makeUser({ status: 'suspended' }));

    renderDetail();

    expect(await screen.findByTestId('status')).toHaveTextContent('停止中');
    expect(screen.getByRole('button', { name: '再開する' })).toBeInTheDocument();
  });

  it('取得に失敗するとエラーと「見つかりません」を出す', async () => {
    apiMock.getUser.mockRejectedValue(
      new ApiError(404, { code: 'not_found', message: 'user not found: u1' }),
    );

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('user not found: u1');
    expect(screen.getByText('ユーザーが見つかりません')).toBeInTheDocument();
  });
});

describe('UserDetailPage 状態切替', () => {
  it('有効なら停止に切り替えて再読み込みする', async () => {
    apiMock.updateStatus.mockResolvedValue(makeUser({ status: 'suspended' }));
    apiMock.getUser
      .mockResolvedValueOnce(makeUser({ status: 'active' }))
      .mockResolvedValue(makeUser({ status: 'suspended' }));

    renderDetail();
    await screen.findByRole('button', { name: '停止する' });
    await userEvent.setup().click(screen.getByRole('button', { name: '停止する' }));

    await waitFor(() => {
      expect(apiMock.updateStatus).toHaveBeenCalledWith('u1', 'suspended');
    });
    expect(await screen.findByTestId('status')).toHaveTextContent('停止中');
  });

  it('停止中なら有効に戻す', async () => {
    apiMock.getUser.mockResolvedValue(makeUser({ status: 'suspended' }));
    apiMock.updateStatus.mockResolvedValue(makeUser({ status: 'active' }));

    renderDetail();
    await screen.findByRole('button', { name: '再開する' });
    await userEvent.setup().click(screen.getByRole('button', { name: '再開する' }));

    await waitFor(() => {
      expect(apiMock.updateStatus).toHaveBeenCalledWith('u1', 'active');
    });
  });

  it('切り替えに失敗するとエラーを出す', async () => {
    apiMock.updateStatus.mockRejectedValue(
      new ApiError(400, { code: 'validation_error', message: 'already suspended' }),
    );

    renderDetail();
    await screen.findByRole('button', { name: '停止する' });
    await userEvent.setup().click(screen.getByRole('button', { name: '停止する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already suspended');
  });
});

describe('UserDetailPage 削除', () => {
  it('削除すると一覧へ戻る', async () => {
    apiMock.deleteUser.mockResolvedValue(undefined);

    renderDetail();
    await screen.findByRole('button', { name: '削除する' });
    await userEvent.setup().click(screen.getByRole('button', { name: '削除する' }));

    expect(await screen.findByText('一覧画面')).toBeInTheDocument();
  });

  it('削除に失敗するとエラーを出し、ボタンを操作可能に戻す', async () => {
    apiMock.deleteUser.mockRejectedValue(
      new ApiError(400, {
        code: 'validation_error',
        message: 'cannot delete the currently signed-in user',
      }),
    );

    renderDetail();
    await screen.findByRole('button', { name: '削除する' });
    await userEvent.setup().click(screen.getByRole('button', { name: '削除する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('cannot delete');
    expect(screen.getByRole('button', { name: '削除する' })).toBeEnabled();
    expect(screen.queryByText('一覧画面')).not.toBeInTheDocument();
  });
});
