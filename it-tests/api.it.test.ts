import { beforeEach, describe, expect, it } from 'vitest';

import { AuthRepository, EventStore, UserRepository } from '@test/core';
import { createApp } from '@test/app';

import { DEFAULT_PASSWORD, insertUser } from './factories/user.ts';
import { getPool, useTransaction } from './setup/db.ts';
import { clearDynamoTable, eventsTableName, getDocClient } from './setup/dynamo.ts';

/**
 * API を実 PostgreSQL / 実 DynamoDB に繋いだ状態で叩く。
 *
 * UT はポートをモックして HTTP 層だけを見ているので、
 * ここでは「実際に永続化されるか」「2ストアをまたいだ結果が整合するか」を見る。
 */
describe('API (PostgreSQL + DynamoDB)', () => {
  const tx = useTransaction(getPool());

  beforeEach(async () => {
    await clearDynamoTable();
  });

  const app = () => {
    const db = tx();
    return createApp({
      users: new UserRepository(db),
      auth: new AuthRepository(db),
      events: new EventStore(getDocClient(), eventsTableName()),
    });
  };

  const json = (body: unknown, cookie?: string) =>
    ({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie === undefined ? {} : { cookie }),
      },
      body: JSON.stringify(body),
    }) satisfies RequestInit;

  /** ログインして Cookie 文字列を得る。 */
  async function login(email: string): Promise<string> {
    const res = await app().request('/api/login', json({ email, password: DEFAULT_PASSWORD }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    const token = /session=([^;]+)/.exec(setCookie)?.[1];
    expect(token).toBeDefined();
    return `session=${token}`;
  }

  describe('ログイン', () => {
    it('保存済みのパスワードで実際にログインでき、/api/me が本人を返す', async () => {
      const user = await insertUser({ email: 'admin@example.com' });
      const cookie = await login('admin@example.com');

      const me = await app().request('/api/me', { headers: { cookie } });

      expect(me.status).toBe(200);
      const body = (await me.json()) as { user: { id: string; email: string } };
      expect(body.user.id).toBe(user.id);
      expect(body.user).not.toHaveProperty('password_hash');
    });

    it('パスワードが違えば 401 でセッションも作られない', async () => {
      await insertUser({ email: 'admin@example.com' });

      const res = await app().request(
        '/api/login',
        json({ email: 'admin@example.com', password: 'wrong-password' }),
      );

      expect(res.status).toBe(401);
      expect(res.headers.get('set-cookie')).toBeNull();

      const sessions = await tx().query('SELECT count(*)::int AS n FROM sessions');
      expect((sessions.rows[0] as { n: number }).n).toBe(0);
    });

    it('ログアウトすると同じ Cookie では 401 になる', async () => {
      await insertUser({ email: 'admin@example.com' });
      const cookie = await login('admin@example.com');

      const out = await app().request('/api/logout', { method: 'POST', headers: { cookie } });
      expect(out.status).toBe(204);

      const me = await app().request('/api/me', { headers: { cookie } });
      expect(me.status).toBe(401);
    });
  });

  describe('ユーザー作成とイベント記録', () => {
    it('作成した内容が PostgreSQL に残り、イベントが DynamoDB に残る', async () => {
      await insertUser({ email: 'admin@example.com' });
      const cookie = await login('admin@example.com');

      const created = await app().request(
        '/api/users',
        json({ email: 'New@Example.com', name: ' Hanako ', password: 'password123' }, cookie),
      );
      expect(created.status).toBe(201);
      const { user } = (await created.json()) as { user: { id: string; email: string } };
      expect(user.email).toBe('new@example.com');

      // PostgreSQL 側
      const detail = await app().request(`/api/users/${user.id}`, { headers: { cookie } });
      expect(detail.status).toBe(200);

      // DynamoDB 側。UT ではモックしていたので、ここで初めて実際の書き込みを見る。
      const events = await app().request(`/api/users/${user.id}/events`, { headers: { cookie } });
      const page = (await events.json()) as { items: { type: string }[] };
      expect(page.items.map((e) => e.type)).toEqual(['user.created']);
    });

    it('重複メールは 400 で、行もイベントも増えない', async () => {
      await insertUser({ email: 'admin@example.com' });
      const existing = await insertUser({ email: 'dup@example.com' });
      const cookie = await login('admin@example.com');

      const res = await app().request(
        '/api/users',
        json({ email: 'DUP@example.com', name: 'Bob', password: 'password123' }, cookie),
      );

      expect(res.status).toBe(400);
      const count = await tx().query('SELECT count(*)::int AS n FROM users WHERE email = $1', [
        'dup@example.com',
      ]);
      expect((count.rows[0] as { n: number }).n).toBe(1);

      const events = await app().request(`/api/users/${existing.id}/events`, {
        headers: { cookie },
      });
      await expect(events.json()).resolves.toMatchObject({ items: [] });
    });
  });

  describe('状態遷移', () => {
    it('停止すると永続化され、履歴にも残る', async () => {
      await insertUser({ email: 'admin@example.com' });
      const target = await insertUser({ status: 'active' });
      const cookie = await login('admin@example.com');

      const res = await app().request(`/api/users/${target.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ status: 'suspended' }),
      });
      expect(res.status).toBe(200);

      const detail = await app().request(`/api/users/${target.id}`, { headers: { cookie } });
      await expect(detail.json()).resolves.toMatchObject({ user: { status: 'suspended' } });

      const events = await app().request(`/api/users/${target.id}/events`, { headers: { cookie } });
      const page = (await events.json()) as { items: { type: string }[] };
      expect(page.items.map((e) => e.type)).toContain('user.status_changed');
    });

    it('同じ状態への変更は 400', async () => {
      await insertUser({ email: 'admin@example.com' });
      const target = await insertUser({ status: 'active' });
      const cookie = await login('admin@example.com');

      const res = await app().request(`/api/users/${target.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ status: 'active' }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('一覧', () => {
    it('created_at 降順で、カーソルを跨いで重複しない', async () => {
      await insertUser({
        email: 'admin@example.com',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      await insertUser({ created_at: new Date('2026-02-01T00:00:00.000Z') });
      await insertUser({ created_at: new Date('2026-03-01T00:00:00.000Z') });
      const cookie = await login('admin@example.com');

      const first = (await (
        await app().request('/api/users?limit=2', { headers: { cookie } })
      ).json()) as { items: { id: string }[]; nextCursor: string | null };
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = (await (
        await app().request(`/api/users?limit=2&cursor=${first.nextCursor}`, {
          headers: { cookie },
        })
      ).json()) as { items: { id: string }[] };

      const firstIds = new Set(first.items.map((u) => u.id));
      expect(second.items.filter((u) => firstIds.has(u.id))).toEqual([]);
    });
  });

  describe('削除', () => {
    it('自分自身は削除できない', async () => {
      const admin = await insertUser({ email: 'admin@example.com' });
      const cookie = await login('admin@example.com');

      const res = await app().request(`/api/users/${admin.id}`, {
        method: 'DELETE',
        headers: { cookie },
      });

      expect(res.status).toBe(400);
      await expect(app().request(`/api/users/${admin.id}`, { headers: { cookie } })).resolves
        .toMatchObject({ status: 200 });
    });

    it('他人を削除すると行が消え、セッションも CASCADE で消える', async () => {
      await insertUser({ email: 'admin@example.com' });
      const target = await insertUser();
      const targetSession = await new AuthRepository(tx()).createSession(target.id);
      const cookie = await login('admin@example.com');

      const res = await app().request(`/api/users/${target.id}`, {
        method: 'DELETE',
        headers: { cookie },
      });
      expect(res.status).toBe(204);

      const detail = await app().request(`/api/users/${target.id}`, { headers: { cookie } });
      expect(detail.status).toBe(404);

      const left = await tx().query('SELECT token FROM sessions WHERE token = $1', [
        targetSession.token,
      ]);
      expect(left.rows).toEqual([]);
    });
  });
});
