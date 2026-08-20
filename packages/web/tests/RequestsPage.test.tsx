// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeRequest, renderInShell } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { ApiError } = await import('../src/api.ts');
const { RequestsPage } = await import('../src/pages/RequestsPage.tsx');

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listRequests.mockResolvedValue({ items: [], nextCursor: null });
});

const render = () => renderInShell(<RequestsPage />, '/requests', '/requests');

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('件名'), '備品購入');
  await user.type(screen.getByLabelText('金額'), '12000');
  return user;
}

describe('RequestsPage 一覧', () => {
  it('取得した申請を、状態と金額つきで表示する', async () => {
    apiMock.listRequests.mockResolvedValue({
      items: [makeRequest({ title: '備品購入', amount: 12000, status: 'pending' })],
      nextCursor: null,
    });

    await render();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('備品購入')).toBeInTheDocument();
    expect(within(table).getByText('承認待ち')).toBeInTheDocument();
    // 金額は機械の値なので等幅で組む。表示は3桁区切り。
    expect(within(table).getByText('¥12,000')).toBeInTheDocument();
    expect(apiMock.listRequests).toHaveBeenCalledWith({
      limit: 5,
      cursor: null,
      status: undefined,
    });
  });

  it('1件も無ければ表ではなく案内を出す', async () => {
    await render();

    expect(await screen.findByText('該当する申請はありません。')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('取得に失敗するとエラーを表示する', async () => {
    apiMock.listRequests.mockRejectedValue(
      new ApiError(500, { code: 'internal_error', message: 'internal server error' }),
    );

    await render();

    expect(await screen.findByRole('alert')).toHaveTextContent('internal server error');
  });
});

describe('RequestsPage 絞り込み', () => {
  it('状態で絞り込み、先頭ページに戻る', async () => {
    await render();
    await screen.findByText('該当する申請はありません。');

    await userEvent.setup().click(screen.getByRole('button', { name: '承認待ち' }));

    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith({
        limit: 5,
        cursor: null,
        status: 'pending',
      });
    });
    expect(screen.getByRole('button', { name: '承認待ち' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('「すべて」に戻すと絞り込みを外す', async () => {
    await render();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '却下' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });

    await user.click(screen.getByRole('button', { name: 'すべて' }));

    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });
  });
});

describe('RequestsPage ページング', () => {
  it('次ページが無ければどちらのボタンも押せない', async () => {
    await render();
    await screen.findByText('該当する申請はありません。');

    expect(screen.getByRole('button', { name: '次へ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '先頭へ' })).toBeDisabled();
  });

  it('「次へ」でカーソルを渡し、「先頭へ」で戻る', async () => {
    apiMock.listRequests
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r1' })], nextCursor: 'c1' })
      .mockResolvedValue({ items: [makeRequest({ id: 'r2' })], nextCursor: null });
    await render();
    await screen.findByRole('table');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'c1' }),
      );
    });

    await user.click(screen.getByRole('button', { name: '先頭へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: null }),
      );
    });
  });

  it('先頭ページでは「前へ」は押せない', async () => {
    await render();
    await screen.findByText('該当する申請はありません。');

    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();
    expect(screen.getByText('1 ページ目')).toBeInTheDocument();
  });

  it('「前へ」で1ページずつ辿ってきたカーソルに戻る', async () => {
    apiMock.listRequests
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r1' })], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r2' })], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r3' })], nextCursor: null })
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r2' })], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r1' })], nextCursor: 'c1' });
    await render();
    await screen.findByRole('table');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'c1' }),
      );
    });
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'c2' }),
      );
    });
    expect(screen.getByText('3 ページ目')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '前へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'c1' }),
      );
    });

    await user.click(screen.getByRole('button', { name: '前へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: null }),
      );
    });
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();
  });

  it('絞り込みを変えるとページ履歴を捨てる', async () => {
    apiMock.listRequests
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r1' })], nextCursor: 'c1' })
      .mockResolvedValue({ items: [makeRequest({ id: 'r2' })], nextCursor: null });
    await render();
    await screen.findByRole('table');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'c1' }),
      );
    });

    // カーソルは絞り込みごとに意味が変わるので、前の絞り込みの履歴は残さない。
    await user.click(screen.getByRole('button', { name: '承認待ち' }));

    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith({
        limit: 5,
        cursor: null,
        status: 'pending',
      });
    });
    expect(screen.getByText('1 ページ目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();
  });
});

describe('RequestsPage 下書き作成', () => {
  it('作成後にフォームを空にして一覧を取り直す', async () => {
    apiMock.createRequest.mockResolvedValue(makeRequest());
    await render();
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: '下書きを作る' }));

    await waitFor(() => {
      expect(apiMock.createRequest).toHaveBeenCalledWith({ title: '備品購入', amount: 12000 });
    });
    expect(screen.getByLabelText('件名')).toHaveValue('');
    expect(apiMock.listRequests).toHaveBeenCalledTimes(2);
  });

  it('2ページ目で作成したら先頭ページに戻る', async () => {
    apiMock.listRequests
      .mockResolvedValueOnce({ items: [makeRequest({ id: 'r1' })], nextCursor: 'c1' })
      .mockResolvedValue({ items: [makeRequest({ id: 'r2' })], nextCursor: null });
    apiMock.createRequest.mockResolvedValue(makeRequest());
    await render();
    await screen.findByRole('table');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '次へ' }));
    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'c1' }),
      );
    });

    await fillForm();
    await user.click(screen.getByRole('button', { name: '下書きを作る' }));

    await waitFor(() => {
      expect(apiMock.listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: null }),
      );
    });
  });

  it('作成に失敗するとエラーを出し、一覧は取り直さない', async () => {
    apiMock.createRequest.mockRejectedValue(
      new ApiError(400, { code: 'validation_error', message: '金額は1以上で入力してください' }),
    );
    await render();
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: '下書きを作る' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('金額は1以上');
    expect(apiMock.listRequests).toHaveBeenCalledTimes(1);
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
      expect(screen.getByRole('button', { name: '下書きを作る' })).toBeEnabled();
    });
  });
});
