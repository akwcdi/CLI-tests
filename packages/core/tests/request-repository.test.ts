import { describe, expect, it, vi } from 'vitest';

import { decodeCursor, encodeCursor, InvalidCursorError } from '../src/cursor.ts';
import { RequestNotFoundError, RequestRepository } from '../src/request-repository.ts';
import type { RequestWithNames } from '../src/types.ts';
import type { Queryable } from '../src/user-repository.ts';
import { ValidationError } from '../src/user.ts';

function createDb() {
  const query = vi.fn<Queryable['query']>();
  return { db: { query } as unknown as Queryable, query };
}

function result<T>(rows: T[], rowCount: number | null = rows.length) {
  return { rows, rowCount };
}

const REQUESTER = 'user-1';
const DECIDER = 'user-2';

function makeRow(overrides: Partial<RequestWithNames> = {}): RequestWithNames {
  return {
    id: 'req-1',
    title: '備品購入',
    amount: 12000,
    status: 'draft',
    requester_id: REQUESTER,
    requester_name: '申請 太郎',
    decided_by: null,
    decider_name: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    decided_at: null,
    ...overrides,
  };
}

const newRequest = { title: '備品購入', amount: 12000, requesterId: REQUESTER };

/** 直近の query 呼び出しの SQL と引数。 */
const callAt = (query: ReturnType<typeof createDb>['query'], i: number) => ({
  sql: String(query.mock.calls[i]?.[0]),
  params: query.mock.calls[i]?.[1] ?? [],
});

describe('RequestRepository.create', () => {
  it('draft として INSERT し、名前を添えた行を返す', async () => {
    const { db, query } = createDb();
    const row = makeRow();
    query.mockResolvedValueOnce(result([{ id: 'req-1' }])).mockResolvedValueOnce(result([row]));

    await expect(new RequestRepository(db).create({ ...newRequest, title: ' 備品購入 ' })).resolves.toBe(
      row,
    );

    expect(callAt(query, 0).sql).toMatch(/INSERT INTO requests/);
    expect(callAt(query, 0).sql).toMatch(/'draft'/);
    expect(callAt(query, 0).params).toEqual(['備品購入', 12000, REQUESTER]);
  });

  it('入力が不正なら DB を触らない', async () => {
    const { db, query } = createDb();

    await expect(
      new RequestRepository(db).create({ ...newRequest, amount: 0 }),
    ).rejects.toThrow(ValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('INSERT が行を返さなければエラー', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new RequestRepository(db).create(newRequest)).rejects.toThrow(
      'INSERT returned no request row',
    );
  });

  it('INSERT 直後に読み戻せなければ RequestNotFoundError', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([{ id: 'req-1' }])).mockResolvedValueOnce(result([]));

    await expect(new RequestRepository(db).create(newRequest)).rejects.toThrow(
      RequestNotFoundError,
    );
  });
});

describe('RequestRepository.findById', () => {
  it('申請者名と決裁者名を JOIN して返す', async () => {
    const { db, query } = createDb();
    const row = makeRow();
    query.mockResolvedValueOnce(result([row]));

    await expect(new RequestRepository(db).findById('req-1')).resolves.toBe(row);
    expect(callAt(query, 0).sql).toMatch(/LEFT JOIN users decider/);
    expect(callAt(query, 0).params).toEqual(['req-1']);
  });

  it('見つからなければ null', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new RequestRepository(db).findById('none')).resolves.toBeNull();
  });
});

describe('RequestRepository.list', () => {
  it('引数なしなら limit=20、絞り込みもカーソルも無い', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new RequestRepository(db).list()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(callAt(query, 0).sql).not.toMatch(/WHERE/);
    expect(callAt(query, 0).params).toEqual([21]);
  });

  it('status で絞り込む', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await new RequestRepository(db).list({ status: 'pending', limit: 3 });

    expect(callAt(query, 0).sql).toMatch(/WHERE r\.status = \$1/);
    expect(callAt(query, 0).params).toEqual(['pending', 4]);
  });

  it('cursor は (created_at, id) の行値比較になる', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));
    const cursor = encodeCursor({ created_at: '2026-02-02T00:00:00.000Z', id: 'req-9' });

    await new RequestRepository(db).list({ cursor, limit: 2 });

    expect(callAt(query, 0).sql).toMatch(/\(r\.created_at, r\.id\) < \(\$1::timestamptz, \$2::uuid\)/);
    expect(callAt(query, 0).params).toEqual(['2026-02-02T00:00:00.000Z', 'req-9', 3]);
  });

  it('status と cursor を同時に指定すると AND で繋がる', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));
    const cursor = encodeCursor({ created_at: '2026-02-02T00:00:00.000Z', id: 'req-9' });

    await new RequestRepository(db).list({ status: 'approved', cursor, limit: 2 });

    const { sql, params } = callAt(query, 0);
    expect(sql).toMatch(/r\.status = \$1 AND \(r\.created_at, r\.id\) < \(\$2::timestamptz, \$3::uuid\)/);
    expect(params).toEqual(['approved', '2026-02-02T00:00:00.000Z', 'req-9', 3]);
  });

  it('次ページがあれば切り詰めて複合カーソルを返す', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(
      result([
        makeRow({ id: 'a', created_at: new Date('2026-03-03T00:00:00.000Z') }),
        makeRow({ id: 'b', created_at: new Date('2026-02-02T00:00:00.000Z') }),
        makeRow({ id: 'c', created_at: new Date('2026-01-01T00:00:00.000Z') }),
      ]),
    );

    const page = await new RequestRepository(db).list({ limit: 2 });

    expect(page.items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(decodeCursor(page.nextCursor as string)).toEqual({
      created_at: '2026-02-02T00:00:00.000Z',
      id: 'b',
    });
  });

  it('次ページが無ければ nextCursor は null', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([makeRow()]));

    await expect(new RequestRepository(db).list({ limit: 2 })).resolves.toMatchObject({
      nextCursor: null,
    });
  });

  it.each([
    ['壊れている', 'broken!!'],
    ['created_at が無い', encodeCursor({ id: 'b' })],
    ['id が無い', encodeCursor({ created_at: '2026-01-01T00:00:00.000Z' })],
    ['型が違う', encodeCursor({ created_at: 1, id: 2 })],
  ])('cursor が不正なら InvalidCursorError: %s', async (_label, cursor) => {
    const { db, query } = createDb();

    await expect(new RequestRepository(db).list({ cursor })).rejects.toThrow(InvalidCursorError);
    expect(query).not.toHaveBeenCalled();
  });

  it('cursor に null を渡した場合は絞り込まない', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await new RequestRepository(db).list({ cursor: null });

    expect(callAt(query, 0).sql).not.toMatch(/WHERE/);
  });

  it.each([
    [0, 2],
    [1000, 101],
  ])('limit=%s は 1..100 に丸められる', async (limit, expected) => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await new RequestRepository(db).list({ limit });

    expect(callAt(query, 0).params).toEqual([expected]);
  });
});

describe('RequestRepository.submit', () => {
  it('draft なら pending にして読み直す', async () => {
    const { db, query } = createDb();
    const updated = makeRow({ status: 'pending' });
    query
      .mockResolvedValueOnce(result([makeRow({ status: 'draft' })]))
      .mockResolvedValueOnce(result([], 1))
      .mockResolvedValueOnce(result([updated]));

    await expect(new RequestRepository(db).submit('req-1', REQUESTER)).resolves.toBe(updated);
    expect(callAt(query, 1).sql).toMatch(/UPDATE requests SET status = 'pending'/);
    // 読んだときの状態を条件に入れて更新する。
    expect(callAt(query, 1).sql).toMatch(/WHERE id = \$1 AND status = \$2/);
    expect(callAt(query, 1).params).toEqual(['req-1', 'draft']);
  });

  it('存在しなければ RequestNotFoundError', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new RequestRepository(db).submit('none', REQUESTER)).rejects.toThrow(
      RequestNotFoundError,
    );
  });

  // 他人の下書きを提出できると、提出者を詐称してから自分で承認できてしまう。
  it('申請者本人でなければ ValidationError で、DB を触らない', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([makeRow({ status: 'draft' })]));

    await expect(new RequestRepository(db).submit('req-1', DECIDER)).rejects.toThrowError(
      new ValidationError('requesterId', '他人の申請は提出できません'),
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('pending からの再提出は ValidationError', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([makeRow({ status: 'pending' })]));

    await expect(new RequestRepository(db).submit('req-1', REQUESTER)).rejects.toThrowError(
      new ValidationError('status', 'pending から pending へは変更できません'),
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  // 判定と更新の間に誰かが動かした場合。読み直させる。
  it('更新が0行なら ValidationError で、読み直さない', async () => {
    const { db, query } = createDb();
    query
      .mockResolvedValueOnce(result([makeRow({ status: 'draft' })]))
      .mockResolvedValueOnce(result([], 0));

    await expect(new RequestRepository(db).submit('req-1', REQUESTER)).rejects.toThrowError(
      new ValidationError('status', '別の操作で状態が変わりました。読み直してください'),
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('RequestRepository.decide', () => {
  const pending = makeRow({ status: 'pending' });

  it('pending を承認し、決裁者と日時を記録する', async () => {
    const { db, query } = createDb();
    const approved = makeRow({ status: 'approved', decided_by: DECIDER, decider_name: '決裁 花子' });
    query
      .mockResolvedValueOnce(result([pending]))
      .mockResolvedValueOnce(result([], 1))
      .mockResolvedValueOnce(result([approved]));
    const now = new Date('2026-05-05T10:00:00.000Z');

    await expect(
      new RequestRepository(db).decide('req-1', 'approved', DECIDER, now),
    ).resolves.toBe(approved);
    // $2 は読んだときの状態。ここが一致しなければ更新されない。
    expect(callAt(query, 1).params).toEqual(['req-1', 'pending', 'approved', DECIDER, now]);
    expect(callAt(query, 1).sql).toMatch(/WHERE id = \$1 AND status = \$2/);
  });

  it('却下もできる', async () => {
    const { db, query } = createDb();
    query
      .mockResolvedValueOnce(result([pending]))
      .mockResolvedValueOnce(result([], 1))
      .mockResolvedValueOnce(result([makeRow({ status: 'rejected' })]));

    await new RequestRepository(db).decide('req-1', 'rejected', DECIDER);

    expect(callAt(query, 1).params[2]).toBe('rejected');
  });

  it('now を省略すると現在時刻を使う', async () => {
    const { db, query } = createDb();
    query
      .mockResolvedValueOnce(result([pending]))
      .mockResolvedValueOnce(result([], 1))
      .mockResolvedValueOnce(result([makeRow({ status: 'approved' })]));
    const before = Date.now();

    await new RequestRepository(db).decide('req-1', 'approved', DECIDER);

    expect((callAt(query, 1).params[4] as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  // 2人が同時に決裁した場合。先に書いた側だけが通る。
  it('更新が0行なら ValidationError で、イベントを書かせない', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([pending])).mockResolvedValueOnce(result([], 0));

    await expect(
      new RequestRepository(db).decide('req-1', 'rejected', DECIDER),
    ).rejects.toThrowError(
      new ValidationError('status', '別の操作で状態が変わりました。読み直してください'),
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('自分が出した申請は決裁できない', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([pending]));

    await expect(
      new RequestRepository(db).decide('req-1', 'approved', REQUESTER),
    ).rejects.toThrowError(new ValidationError('deciderId', '自分が出した申請は決裁できません'));
    // 遷移は妥当だが本人なので、UPDATE まで進まない。
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('draft を直接決裁しようとしたら ValidationError', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([makeRow({ status: 'draft' })]));

    await expect(
      new RequestRepository(db).decide('req-1', 'approved', DECIDER),
    ).rejects.toThrow(/draft から approved/);
  });

  it('存在しなければ RequestNotFoundError', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(
      new RequestRepository(db).decide('none', 'approved', DECIDER),
    ).rejects.toThrow(RequestNotFoundError);
  });
});

describe('RequestRepository.countByStatus', () => {
  it('件数を返す', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([{ n: 7 }]));

    await expect(new RequestRepository(db).countByStatus('pending')).resolves.toBe(7);
    expect(callAt(query, 0).params).toEqual(['pending']);
  });

  it('行が無ければ 0', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new RequestRepository(db).countByStatus('draft')).resolves.toBe(0);
  });
});
