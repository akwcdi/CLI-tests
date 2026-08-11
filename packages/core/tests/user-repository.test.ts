import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRow } from '../src/types.ts';
import { UserNotFoundError, UserRepository, type Queryable } from '../src/user-repository.ts';
import { ValidationError } from '../src/user.ts';

/** query() をモックした Queryable。UT では DB に一切触れない。 */
function createDb() {
  const query = vi.fn<Queryable['query']>();
  return { db: { query } as unknown as Queryable, query };
}

function makeRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
    name: 'Taro',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** rows/rowCount を返す query の戻り値を組み立てる。 */
function result(rows: UserRow[], rowCount: number | null = rows.length) {
  return { rows, rowCount };
}

describe('UserRepository.create', () => {
  it('重複が無ければ INSERT して挿入行を返す', async () => {
    const { db, query } = createDb();
    const row = makeRow();
    // 1回目: findByEmail（重複なし） / 2回目: INSERT
    query.mockResolvedValueOnce(result([])).mockResolvedValueOnce(result([row]));
    const repo = new UserRepository(db);

    const created = await repo.create({ email: ' USER@Example.com ', name: ' Taro ' });

    expect(created).toBe(row);
    expect(query).toHaveBeenCalledTimes(2);
    // 正規化された値で INSERT されること。
    expect(query.mock.calls[1]?.[1]).toEqual(['user@example.com', 'Taro', 'active']);
    expect(query.mock.calls[1]?.[0]).toMatch(/INSERT INTO users/);
  });

  it('入力が不正なら DB を触らずに ValidationError', async () => {
    const { db, query } = createDb();
    const repo = new UserRepository(db);

    await expect(repo.create({ email: 'bad', name: 'Taro' })).rejects.toThrow(ValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('同じメールが登録済みなら ValidationError で INSERT しない', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([makeRow()]));
    const repo = new UserRepository(db);

    await expect(repo.create({ email: 'user@example.com', name: 'Taro' })).rejects.toThrow(
      /email already registered/,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('INSERT が行を返さなければエラー', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([])).mockResolvedValueOnce(result([]));
    const repo = new UserRepository(db);

    await expect(repo.create({ email: 'user@example.com', name: 'Taro' })).rejects.toThrow(
      'INSERT returned no row',
    );
  });
});

describe('UserRepository.findById', () => {
  it('見つかれば行を返す', async () => {
    const { db, query } = createDb();
    const row = makeRow();
    query.mockResolvedValueOnce(result([row]));

    await expect(new UserRepository(db).findById(row.id)).resolves.toBe(row);
    expect(query.mock.calls[0]?.[1]).toEqual([row.id]);
  });

  it('見つからなければ null', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new UserRepository(db).findById('missing')).resolves.toBeNull();
  });
});

describe('UserRepository.findByEmail', () => {
  it('メールを正規化して検索する', async () => {
    const { db, query } = createDb();
    const row = makeRow();
    query.mockResolvedValueOnce(result([row]));

    await expect(new UserRepository(db).findByEmail(' USER@Example.com ')).resolves.toBe(row);
    expect(query.mock.calls[0]?.[1]).toEqual(['user@example.com']);
  });

  it('見つからなければ null', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new UserRepository(db).findByEmail('none@example.com')).resolves.toBeNull();
  });
});

describe('UserRepository.list', () => {
  it('引数なしなら limit=20、cursor 無しのクエリを投げる', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    const page = await new UserRepository(db).list();

    expect(page).toEqual({ items: [], nextCursor: null });
    // 次ページ判定のため limit+1 件を要求する。
    expect(query.mock.calls[0]?.[1]).toEqual([21]);
    expect(query.mock.calls[0]?.[0]).not.toMatch(/created_at </);
  });

  it('次ページが無ければ nextCursor は null', async () => {
    const { db, query } = createDb();
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' })];
    query.mockResolvedValueOnce(result(rows));

    const page = await new UserRepository(db).list({ limit: 2 });

    expect(page.items).toEqual(rows);
    expect(page.nextCursor).toBeNull();
  });

  it('次ページがあれば limit 件に切り詰めて nextCursor を返す', async () => {
    const { db, query } = createDb();
    const rows = [
      makeRow({ id: 'a', created_at: new Date('2026-03-03T00:00:00.000Z') }),
      makeRow({ id: 'b', created_at: new Date('2026-02-02T00:00:00.000Z') }),
      makeRow({ id: 'c', created_at: new Date('2026-01-01T00:00:00.000Z') }),
    ];
    query.mockResolvedValueOnce(result(rows));

    const page = await new UserRepository(db).list({ limit: 2 });

    expect(page.items.map((r) => r.id)).toEqual(['a', 'b']);
    // 最後に返した行の created_at が次のカーソルになる。
    expect(page.nextCursor).toBe('2026-02-02T00:00:00.000Z');
  });

  it('cursor 指定時は created_at < $1 で絞り込む', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await new UserRepository(db).list({ limit: 5, cursor: '2026-02-02T00:00:00.000Z' });

    expect(query.mock.calls[0]?.[0]).toMatch(/created_at </);
    expect(query.mock.calls[0]?.[1]).toEqual(['2026-02-02T00:00:00.000Z', 6]);
  });

  it('cursor に null を渡した場合は cursor 無しとして扱う', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await new UserRepository(db).list({ cursor: null });

    expect(query.mock.calls[0]?.[0]).not.toMatch(/created_at </);
  });

  it.each([
    [0, 2],
    [-10, 2],
    [1000, 101],
  ])('limit=%s は 1..100 に丸められる', async (limit, expectedParam) => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await new UserRepository(db).list({ limit });

    expect(query.mock.calls[0]?.[1]).toEqual([expectedParam]);
  });
});

describe('UserRepository.updateStatus', () => {
  let repo: UserRepository;
  let query: ReturnType<typeof createDb>['query'];

  beforeEach(() => {
    const created = createDb();
    query = created.query;
    repo = new UserRepository(created.db);
  });

  it('遷移できるなら UPDATE して更新後の行を返す', async () => {
    const updated = makeRow({ status: 'suspended' });
    query.mockResolvedValueOnce(result([makeRow()])).mockResolvedValueOnce(result([updated]));

    await expect(repo.updateStatus(updated.id, 'suspended')).resolves.toBe(updated);
    expect(query.mock.calls[1]?.[1]).toEqual([updated.id, 'suspended']);
  });

  it('対象が存在しなければ UserNotFoundError', async () => {
    query.mockResolvedValueOnce(result([]));

    await expect(repo.updateStatus('missing', 'suspended')).rejects.toThrow(UserNotFoundError);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('同じステータスへの更新は ValidationError', async () => {
    query.mockResolvedValueOnce(result([makeRow({ status: 'active' })]));

    await expect(repo.updateStatus('id', 'active')).rejects.toThrow(
      new ValidationError('status', 'already active'),
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('UPDATE が行を返さなければ UserNotFoundError（並行削除された場合）', async () => {
    query.mockResolvedValueOnce(result([makeRow()])).mockResolvedValueOnce(result([]));

    await expect(repo.updateStatus('id', 'suspended')).rejects.toThrow(UserNotFoundError);
  });
});

describe('UserNotFoundError', () => {
  it('id と name を保持する', () => {
    const error = new UserNotFoundError('abc');

    expect(error.name).toBe('UserNotFoundError');
    expect(error.id).toBe('abc');
    expect(error.message).toBe('user not found: abc');
  });
});

describe('UserRepository.deleteById', () => {
  it.each([
    [1, true],
    [0, false],
    [null, false],
  ])('rowCount=%s なら %s を返す', async (rowCount, expected) => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([], rowCount));

    await expect(new UserRepository(db).deleteById('id')).resolves.toBe(expected);
    expect(query.mock.calls[0]?.[0]).toMatch(/DELETE FROM users/);
  });
});
