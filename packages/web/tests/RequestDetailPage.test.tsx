// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiMock } from './api-mock.ts';
import { makeEvent, makeRequest, renderInShell } from './helpers.tsx';

vi.mock('../src/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.ts')>()),
  api: apiMock,
}));

const { ApiError } = await import('../src/api.ts');
const { RequestDetailPage } = await import('../src/pages/RequestDetailPage.tsx');

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getRequest.mockResolvedValue(makeRequest());
  apiMock.listRequestEvents.mockResolvedValue({ items: [], nextCursor: null });
});

const render = () => renderInShell(<RequestDetailPage />, '/requests/r1', '/requests/:id');

describe('RequestDetailPage 表示', () => {
  it('件名・金額・申請者と、未決裁であることを出す', async () => {
    apiMock.getRequest.mockResolvedValue(
      makeRequest({ title: '備品購入', amount: 12000, requester_name: '田中 太郎' }),
    );

    await render();

    expect(await screen.findByRole('heading', { name: '備品購入' })).toBeInTheDocument();
    expect(screen.getByText('¥12,000')).toBeInTheDocument();
    expect(screen.getByText('田中 太郎')).toBeInTheDocument();
    expect(screen.getByText('未決裁')).toBeInTheDocument();
    expect(apiMock.getRequest).toHaveBeenCalledWith('r1');
  });

  it('決裁済みなら決裁者と日時を出す', async () => {
    apiMock.getRequest.mockResolvedValue(
      makeRequest({
        status: 'approved',
        decided_by: 'u2',
        decider_name: '決裁 花子',
        decided_at: '2026-02-02T03:04:00.000Z',
      }),
    );

    await render();

    expect(await screen.findByText('決裁 花子')).toBeInTheDocument();
    expect(screen.getByText('承認済み')).toBeInTheDocument();
    expect(screen.queryByText('未決裁')).not.toBeInTheDocument();
  });

  it('決裁者が削除済みでも日時は出す', async () => {
    apiMock.getRequest.mockResolvedValue(
      makeRequest({
        status: 'approved',
        decided_by: null,
        decider_name: null,
        decided_at: '2026-02-02T03:04:00.000Z',
      }),
    );

    await render();

    expect(await screen.findByText('（削除済みの利用者）')).toBeInTheDocument();
  });

  it('経過が無ければその旨を出す', async () => {
    await render();

    expect(await screen.findByText('記録はありません。')).toBeInTheDocument();
  });

  it('経過を日本語のラベルで並べる', async () => {
    apiMock.listRequestEvents.mockResolvedValue({
      items: [
        makeEvent({ type: 'request.created' }),
        makeEvent({ type: 'request.submitted', occurredAt: '2026-01-02T00:00:00.000Z' }),
      ],
      nextCursor: null,
    });

    await render();

    expect(await screen.findByText('申請を作成')).toBeInTheDocument();
    expect(screen.getByText('承認へ提出')).toBeInTheDocument();
  });

  it('取得に失敗するとエラーと「見つかりません」を出す', async () => {
    apiMock.getRequest.mockRejectedValue(
      new ApiError(404, { code: 'not_found', message: 'request not found: r1' }),
    );

    await render();

    expect(await screen.findByRole('alert')).toHaveTextContent('request not found: r1');
    expect(screen.getByText('申請が見つかりません。')).toBeInTheDocument();
  });
});

describe('RequestDetailPage 操作', () => {
  it('下書きなら「承認へ回す」だけを出し、押すと提出して読み直す', async () => {
    apiMock.getRequest
      .mockResolvedValueOnce(makeRequest({ status: 'draft' }))
      .mockResolvedValue(makeRequest({ status: 'pending' }));
    apiMock.submitRequest.mockResolvedValue(makeRequest({ status: 'pending' }));

    await render();
    await screen.findByRole('button', { name: '承認へ回す' });
    expect(screen.queryByRole('button', { name: '承認する' })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: '承認へ回す' }));

    await waitFor(() => {
      expect(apiMock.submitRequest).toHaveBeenCalledWith('r1');
    });
    expect(await screen.findByText('承認待ち')).toBeInTheDocument();
  });

  it.each([
    ['承認する', 'approved'],
    ['却下する', 'rejected'],
  ] as const)('承認待ちなら「%s」が押せる', async (label, decision) => {
    apiMock.getRequest.mockResolvedValue(makeRequest({ status: 'pending' }));
    apiMock.decideRequest.mockResolvedValue(makeRequest({ status: decision }));

    await render();
    await screen.findByRole('button', { name: label });
    expect(screen.queryByRole('button', { name: '承認へ回す' })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: label }));

    await waitFor(() => {
      expect(apiMock.decideRequest).toHaveBeenCalledWith('r1', decision);
    });
  });

  it('決裁済みなら操作ボタンを出さない', async () => {
    apiMock.getRequest.mockResolvedValue(
      makeRequest({ status: 'approved', decided_at: '2026-02-02T00:00:00.000Z' }),
    );

    await render();
    await screen.findByText('承認済み');

    expect(screen.queryByRole('button', { name: '承認へ回す' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '承認する' })).not.toBeInTheDocument();
  });

  it('自分の申請を決裁しようとするとサーバーの理由を出す', async () => {
    apiMock.getRequest.mockResolvedValue(makeRequest({ status: 'pending' }));
    apiMock.decideRequest.mockRejectedValue(
      new ApiError(400, { code: 'validation_error', message: '自分が出した申請は決裁できません' }),
    );

    await render();
    await userEvent.setup().click(await screen.findByRole('button', { name: '承認する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('自分が出した申請は決裁できません');
  });
});
