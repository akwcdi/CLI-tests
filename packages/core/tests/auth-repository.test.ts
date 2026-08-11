import { describe, expect, it, vi } from 'vitest';

import { AuthRepository } from '../src/auth-repository.ts';
import type { SessionRow, UserCredentials, UserRow } from '../src/types.ts';
import type { Queryable } from '../src/user-repository.ts';

function createDb() {
  const query = vi.fn<Queryable['query']>();
  return { db: { query } as unknown as Queryable, query };
}

function result<T>(rows: T[], rowCount: number | null = rows.length) {
  return { rows, rowCount };
}

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER_ID,
    email: 'user@example.com',
    name: 'Taro',
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthRepository.findCredentialsByEmail', () => {
  it('メールを正規化して password_hash を引く', async () => {
    const { db, query } = createDb();
    const credentials: UserCredentials = { id: USER_ID, password_hash: 'scrypt$aa$bb' };
    query.mockResolvedValueOnce(result([credentials]));

    await expect(
      new AuthRepository(db).findCredentialsByEmail(' USER@Example.com '),
    ).resolves.toBe(credentials);
    expect(query.mock.calls[0]?.[1]).toEqual(['user@example.com']);
  });

  it('該当が無ければ null', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(
      new AuthRepository(db).findCredentialsByEmail('none@example.com'),
    ).resolves.toBeNull();
  });
});

describe('AuthRepository.createSession', () => {
  const session: SessionRow = {
    token: 'tok',
    user_id: USER_ID,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    expires_at: new Date('2026-01-02T00:00:00.000Z'),
  };

  it('トークンを生成し、24時間後を期限にして INSERT する', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([session]));
    const now = new Date('2026-01-01T00:00:00.000Z');

    await expect(new AuthRepository(db).createSession(USER_ID, now)).resolves.toBe(session);

    const [token, userId, expiresAt] = query.mock.calls[0]?.[1] ?? [];
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(userId).toBe(USER_ID);
    expect((expiresAt as Date).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('now を省略すると現在時刻を基準にする', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([session]));
    const before = Date.now();

    await new AuthRepository(db).createSession(USER_ID);

    const expiresAt = query.mock.calls[0]?.[1]?.[2] as Date;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 86_400_000);
  });

  it('毎回異なるトークンになる', async () => {
    const { db, query } = createDb();
    query.mockResolvedValue(result([session]));
    const repo = new AuthRepository(db);

    await repo.createSession(USER_ID);
    await repo.createSession(USER_ID);

    expect(query.mock.calls[0]?.[1]?.[0]).not.toBe(query.mock.calls[1]?.[1]?.[0]);
  });

  it('INSERT が行を返さなければエラー', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new AuthRepository(db).createSession(USER_ID)).rejects.toThrow(
      'INSERT returned no session row',
    );
  });
});

describe('AuthRepository.findUserBySession', () => {
  it('有効なセッションならユーザーを返す', async () => {
    const { db, query } = createDb();
    const user = makeUser();
    query.mockResolvedValueOnce(result([user]));
    const now = new Date('2026-01-01T06:00:00.000Z');

    await expect(new AuthRepository(db).findUserBySession('tok', now)).resolves.toBe(user);

    // 期限切れを SQL 側で除外していること。
    expect(query.mock.calls[0]?.[0]).toMatch(/expires_at > \$2/);
    expect(query.mock.calls[0]?.[1]).toEqual(['tok', now]);
  });

  it('該当が無ければ null（未知のトークン・期限切れ・ユーザー削除済み）', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));

    await expect(new AuthRepository(db).findUserBySession('tok')).resolves.toBeNull();
  });

  it('now を省略すると現在時刻で判定する', async () => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([]));
    const before = Date.now();

    await new AuthRepository(db).findUserBySession('tok');

    expect((query.mock.calls[0]?.[1]?.[1] as Date).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('AuthRepository.deleteSession', () => {
  it.each([
    [1, true],
    [0, false],
    [null, false],
  ])('rowCount=%s なら %s を返す', async (rowCount, expected) => {
    const { db, query } = createDb();
    query.mockResolvedValueOnce(result([], rowCount));

    await expect(new AuthRepository(db).deleteSession('tok')).resolves.toBe(expected);
    expect(query.mock.calls[0]?.[0]).toMatch(/DELETE FROM sessions/);
  });
});
