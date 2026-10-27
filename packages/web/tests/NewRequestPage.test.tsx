// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeRequest, renderInShell } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { ApiError } = await import('../src/api.ts');
const { NewRequestPage } = await import('../src/pages/NewRequestPage.tsx');

beforeEach(() => {
  vi.clearAllMocks();
});

const render = () => renderInShell(<NewRequestPage />, '/requests/new', '/requests/new');

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('件名'), '備品購入');
  await user.type(screen.getByLabelText('金額'), '12000');
  return user;
}

describe('NewRequestPage 下書き作成', () => {
  it('作成したら、その申請の詳細へ送る', async () => {
    apiMock.createRequest.mockResolvedValue(makeRequest({ id: 'r9' }));
    await render();
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: '下書きを作る' }));

    await waitFor(() => {
      expect(apiMock.createRequest).toHaveBeenCalledWith({ title: '備品購入', amount: 12000 });
    });
    // 次の行動は提出なので、一覧ではなく「作った申請の」詳細に着く。
    expect(await screen.findByText('申請詳細画面 r9')).toBeInTheDocument();
  });

  it('金額が整数に読めないときは送らず、日本語で理由を出す', async () => {
    await render();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('件名'), '備品購入');
    await user.type(screen.getByLabelText('金額'), '12,000');

    await user.click(screen.getByRole('button', { name: '下書きを作る' }));

    // API に預けると core を通らず英語の文言が返るので、手前で止める。
    expect(await screen.findByRole('alert')).toHaveTextContent('金額は整数で入力してください');
    expect(apiMock.createRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '下書きを作る' })).toBeEnabled();
  });

  it('作成に失敗するとエラーを出し、入力は残したまま留まる', async () => {
    apiMock.createRequest.mockRejectedValue(
      new ApiError(400, { code: 'validation_error', message: '金額は1以上で入力してください' }),
    );
    await render();
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: '下書きを作る' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('金額は1以上');
    // 書き直せるよう、画面も入力も保つ。
    expect(screen.getByLabelText('件名')).toHaveValue('備品購入');
    expect(screen.queryByText(/^申請詳細画面/)).not.toBeInTheDocument();
    // 金額を直してもう一度送れること。
    expect(screen.getByRole('button', { name: '下書きを作る' })).toBeEnabled();
  });

  it('送信中はボタンを無効にする', async () => {
    let resolve: (value: unknown) => void = () => {};
    apiMock.createRequest.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await render();
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: '下書きを作る' }));
    expect(screen.getByRole('button', { name: '下書きを作る' })).toBeDisabled();

    resolve(makeRequest());
    await waitFor(() => {
      expect(screen.getByText('申請詳細画面 r1')).toBeInTheDocument();
    });
  });

  it('作らずに一覧へ戻れる', async () => {
    await render();
    const user = userEvent.setup();

    await user.click(screen.getByRole('link', { name: '一覧へ戻る' }));

    expect(await screen.findByText('申請一覧画面')).toBeInTheDocument();
    expect(apiMock.createRequest).not.toHaveBeenCalled();
  });
});
