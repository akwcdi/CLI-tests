import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hashPassword,
  RequestNotFoundError,
  UserNotFoundError,
  ValidationError,
  type RequestWithNames,
  type UserRow,
} from '@test/core';

import { createApp } from '../src/app.ts';
import type { AuthPort, Deps, EventsPort, RequestsPort, UsersPort } from '../src/types.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'session-token';

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

function createDeps() {
  const users = {
    create: vi.fn<UsersPort['create']>(),
    findById: vi.fn<UsersPort['findById']>(),
    list: vi.fn<UsersPort['list']>(),
    updateStatus: vi.fn<UsersPort['updateStatus']>(),
    deleteById: vi.fn<UsersPort['deleteById']>(),
    countAll: vi.fn<UsersPort['countAll']>(),
  };
  const auth = {
    findCredentialsByEmail: vi.fn<AuthPort['findCredentialsByEmail']>(),
    createSession: vi.fn<AuthPort['createSession']>(),
    findUserBySession: vi.fn<AuthPort['findUserBySession']>(),
    deleteSession: vi.fn<AuthPort['deleteSession']>(),
  };
  const events = {
    append: vi.fn<EventsPort['append']>(),
    listByUser: vi.fn<EventsPort['listByUser']>(),
  };
  const requests = {
    create: vi.fn<RequestsPort['create']>(),
    findById: vi.fn<RequestsPort['findById']>(),
    list: vi.fn<RequestsPort['list']>(),
    submit: vi.fn<RequestsPort['submit']>(),
    decide: vi.fn<RequestsPort['decide']>(),
    countByStatus: vi.fn<RequestsPort['countByStatus']>(),
  };
  const deps: Deps = { users, auth, events, requests };
  return { deps, users, auth, events, requests, app: createApp(deps) };
}

/** 認証済みリクエスト用のヘッダ。 */
const authed = { headers: { cookie: `session=${TOKEN}` } };

describe('GET /api/health', () => {
  it('認証なしで 200 を返す', async () => {
    const { app } = createDeps();

    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe('POST /api/login', () => {
  const post = (body: unknown) =>
    ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) satisfies RequestInit;

  let ctx: ReturnType<typeof createDeps>;
  let passwordHash: string;

  beforeEach(async () => {
    ctx = createDeps();
    passwordHash = await hashPassword('password123');
  });

  it('正しい資格情報ならセッション Cookie を発行しユーザーを返す', async () => {
    const user = makeUser();
    ctx.auth.findCredentialsByEmail.mockResolvedValue({ id: USER_ID, password_hash: passwordHash });
    ctx.auth.createSession.mockResolvedValue({
      token: TOKEN,
      user_id: USER_ID,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      expires_at: new Date('2026-01-02T00:00:00.000Z'),
    });
    ctx.auth.findUserBySession.mockResolvedValue(user);

    const res = await ctx.app.request(
      '/api/login',
      post({ email: 'user@example.com', password: 'password123' }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ user: JSON.parse(JSON.stringify({ user })).user });

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`session=${TOKEN}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    // ログインも監査イベントとして記録する。
    expect(ctx.events.append).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, type: 'user.logged_in' }),
    );
  });

  it('未登録のメールは 401（存在有無を漏らさない）', async () => {
    ctx.auth.findCredentialsByEmail.mockResolvedValue(null);

    const res = await ctx.app.request(
      '/api/login',
      post({ email: 'nobody@example.com', password: 'password123' }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'unauthorized', message: 'email or password is incorrect' },
    });
    expect(ctx.auth.createSession).not.toHaveBeenCalled();
  });

  it('パスワード違いは 401 で、メッセージが未登録時と同一', async () => {
    ctx.auth.findCredentialsByEmail.mockResolvedValue({ id: USER_ID, password_hash: passwordHash });

    const res = await ctx.app.request(
      '/api/login',
      post({ email: 'user@example.com', password: 'wrong-password' }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'unauthorized', message: 'email or password is incorrect' },
    });
  });

  it('壊れた JSON は 400', async () => {
    const res = await ctx.app.request('/api/login', post('{'));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'validation_error', field: 'body' },
    });
  });

  it.each([
    ['email が無い', { password: 'password123' }, 'email'],
    ['password が無い', { email: 'user@example.com' }, 'password'],
  ])('%s なら 400', async (_label, body, field) => {
    const res = await ctx.app.request('/api/login', post(body));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { field } });
  });

  it('発行直後のセッションが引けなければ 500（内部情報は出さない）', async () => {
    ctx.auth.findCredentialsByEmail.mockResolvedValue({ id: USER_ID, password_hash: passwordHash });
    ctx.auth.createSession.mockResolvedValue({
      token: TOKEN,
      user_id: USER_ID,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 1000),
    });
    ctx.auth.findUserBySession.mockResolvedValue(null);

    const res = await ctx.app.request(
      '/api/login',
      post({ email: 'user@example.com', password: 'password123' }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'internal_error', message: 'internal server error' },
    });
  });
});

describe('POST /api/logout', () => {
  it('Cookie があればセッションを削除して 204', async () => {
    const { app, auth } = createDeps();
    auth.deleteSession.mockResolvedValue(true);

    const res = await app.request('/api/logout', { method: 'POST', ...authed });

    expect(res.status).toBe(204);
    expect(auth.deleteSession).toHaveBeenCalledWith(TOKEN);
    expect(res.headers.get('set-cookie')).toContain('session=;');
  });

  it('Cookie が無くても 204（冪等）', async () => {
    const { app, auth } = createDeps();

    const res = await app.request('/api/logout', { method: 'POST' });

    expect(res.status).toBe(204);
    expect(auth.deleteSession).not.toHaveBeenCalled();
  });
});

describe('認証ミドルウェア', () => {
  it('Cookie が無ければ 401', async () => {
    const { app } = createDeps();

    const res = await app.request('/api/me');

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'unauthorized', message: 'authentication required' },
    });
  });

  it('セッションが無効なら 401', async () => {
    const { app, auth } = createDeps();
    auth.findUserBySession.mockResolvedValue(null);

    const res = await app.request('/api/me', authed);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { message: 'session is invalid or expired' },
    });
  });

  it('有効なら GET /api/me が現在のユーザーを返す', async () => {
    const { app, auth } = createDeps();
    auth.findUserBySession.mockResolvedValue(makeUser());

    const res = await app.request('/api/me', authed);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ user: { id: USER_ID } });
  });
});

describe('認証済みルート', () => {
  let ctx: ReturnType<typeof createDeps>;

  beforeEach(() => {
    ctx = createDeps();
    ctx.auth.findUserBySession.mockResolvedValue(makeUser());
  });

  describe('GET /api/users', () => {
    it('limit / cursor をそのまま core に渡す', async () => {
      ctx.users.list.mockResolvedValue({ items: [], nextCursor: null });

      const res = await ctx.app.request('/api/users?limit=5&cursor=abc', authed);

      expect(res.status).toBe(200);
      expect(ctx.users.list).toHaveBeenCalledWith({ limit: 5, cursor: 'abc' });
    });

    it('クエリ省略時は limit undefined / cursor null', async () => {
      ctx.users.list.mockResolvedValue({ items: [makeUser()], nextCursor: 'next' });

      const res = await ctx.app.request('/api/users', authed);

      expect(ctx.users.list).toHaveBeenCalledWith({ limit: undefined, cursor: null });
      await expect(res.json()).resolves.toMatchObject({ nextCursor: 'next' });
    });

    it('limit が不正なら 400', async () => {
      const res = await ctx.app.request('/api/users?limit=0', authed);

      expect(res.status).toBe(400);
      expect(ctx.users.list).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/users', () => {
    const post = (body: unknown) =>
      ({
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `session=${TOKEN}` },
        body: JSON.stringify(body),
      }) satisfies RequestInit;

    it('作成して 201 を返し、作成イベントを記録する', async () => {
      const created = makeUser({ id: OTHER_ID, email: 'new@example.com', name: 'Hanako' });
      ctx.users.create.mockResolvedValue(created);

      const res = await ctx.app.request(
        '/api/users',
        post({ email: 'new@example.com', name: 'Hanako', password: 'password123' }),
      );

      expect(res.status).toBe(201);
      expect(ctx.users.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'Hanako',
        password: 'password123',
        status: undefined,
      });
      expect(ctx.events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: OTHER_ID,
          type: 'user.created',
          payload: { email: 'new@example.com', name: 'Hanako' },
        }),
      );
    });

    it('status を指定すると core に渡る', async () => {
      ctx.users.create.mockResolvedValue(makeUser({ status: 'suspended' }));

      await ctx.app.request(
        '/api/users',
        post({
          email: 'new@example.com',
          name: 'Hanako',
          password: 'password123',
          status: 'suspended',
        }),
      );

      expect(ctx.users.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' }),
      );
    });

    it('core の ValidationError は 400 に変換される', async () => {
      ctx.users.create.mockRejectedValue(
        new ValidationError('email', 'email already registered: dup@example.com'),
      );

      const res = await ctx.app.request(
        '/api/users',
        post({ email: 'dup@example.com', name: 'Hanako', password: 'password123' }),
      );

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: { field: 'email', message: /already registered/ as unknown as string },
      });
      expect(ctx.events.append).not.toHaveBeenCalled();
    });

    it('必須項目が欠けていれば 400', async () => {
      const res = await ctx.app.request('/api/users', post({ email: 'a@example.com' }));

      expect(res.status).toBe(400);
      expect(ctx.users.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/users/:id', () => {
    it('見つかれば 200', async () => {
      ctx.users.findById.mockResolvedValue(makeUser({ id: OTHER_ID }));

      const res = await ctx.app.request(`/api/users/${OTHER_ID}`, authed);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ user: { id: OTHER_ID } });
    });

    it('見つからなければ 404', async () => {
      ctx.users.findById.mockResolvedValue(null);

      const res = await ctx.app.request(`/api/users/${OTHER_ID}`, authed);

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toMatchObject({ error: { code: 'not_found' } });
    });
  });

  describe('PATCH /api/users/:id/status', () => {
    const patch = (body: unknown) =>
      ({
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: `session=${TOKEN}` },
        body: JSON.stringify(body),
      }) satisfies RequestInit;

    it('更新して 200 を返し、状態変更イベントを記録する', async () => {
      ctx.users.updateStatus.mockResolvedValue(makeUser({ id: OTHER_ID, status: 'suspended' }));

      const res = await ctx.app.request(
        `/api/users/${OTHER_ID}/status`,
        patch({ status: 'suspended' }),
      );

      expect(res.status).toBe(200);
      expect(ctx.users.updateStatus).toHaveBeenCalledWith(OTHER_ID, 'suspended');
      expect(ctx.events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: OTHER_ID,
          type: 'user.status_changed',
          payload: { status: 'suspended' },
        }),
      );
    });

    it('許可外のステータスは 400', async () => {
      const res = await ctx.app.request(`/api/users/${OTHER_ID}/status`, patch({ status: 'gone' }));

      expect(res.status).toBe(400);
      expect(ctx.users.updateStatus).not.toHaveBeenCalled();
    });

    it('存在しない id なら 404', async () => {
      ctx.users.updateStatus.mockRejectedValue(new UserNotFoundError(OTHER_ID));

      const res = await ctx.app.request(
        `/api/users/${OTHER_ID}/status`,
        patch({ status: 'suspended' }),
      );

      expect(res.status).toBe(404);
      expect(ctx.events.append).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/users/:id', () => {
    const del = { method: 'DELETE', ...authed } satisfies RequestInit;

    it('削除して 204 を返し、削除イベントを記録する', async () => {
      ctx.users.deleteById.mockResolvedValue(true);

      const res = await ctx.app.request(`/api/users/${OTHER_ID}`, del);

      expect(res.status).toBe(204);
      expect(ctx.events.append).toHaveBeenCalledWith(
        expect.objectContaining({ userId: OTHER_ID, type: 'user.deleted' }),
      );
    });

    it('ログイン中の自分自身は削除できず 400', async () => {
      const res = await ctx.app.request(`/api/users/${USER_ID}`, del);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: { field: 'id', code: 'validation_error' },
      });
      expect(ctx.users.deleteById).not.toHaveBeenCalled();
    });

    it('対象が無ければ 404', async () => {
      ctx.users.deleteById.mockResolvedValue(false);

      const res = await ctx.app.request(`/api/users/${OTHER_ID}`, del);

      expect(res.status).toBe(404);
      expect(ctx.events.append).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/users/:id/events', () => {
    it('イベント一覧を返す', async () => {
      ctx.events.listByUser.mockResolvedValue({
        items: [
          {
            userId: OTHER_ID,
            occurredAt: '2026-01-01T00:00:00.000Z',
            type: 'user.created',
            payload: {},
          },
        ],
        nextCursor: null,
      });

      const res = await ctx.app.request(`/api/users/${OTHER_ID}/events?limit=3`, authed);

      expect(res.status).toBe(200);
      expect(ctx.events.listByUser).toHaveBeenCalledWith(OTHER_ID, { limit: 3, cursor: null });
      await expect(res.json()).resolves.toMatchObject({ items: [{ type: 'user.created' }] });
    });

    it('cursor が壊れていれば 400', async () => {
      const { InvalidCursorError } = await import('@test/core');
      ctx.events.listByUser.mockRejectedValue(new InvalidCursorError('broken'));

      const res = await ctx.app.request(`/api/users/${OTHER_ID}/events?cursor=broken`, authed);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: { code: 'invalid_cursor' } });
    });
  });
});

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

function makeRequest(overrides: Partial<RequestWithNames> = {}): RequestWithNames {
  return {
    id: REQUEST_ID,
    title: '備品購入',
    amount: 12000,
    status: 'draft',
    requester_id: USER_ID,
    requester_name: 'Taro',
    decided_by: null,
    decider_name: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    decided_at: null,
    ...overrides,
  };
}

describe('申請 API', () => {
  let ctx: ReturnType<typeof createDeps>;

  const postJson = (body: unknown) =>
    ({
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `session=${TOKEN}` },
      body: JSON.stringify(body),
    }) satisfies RequestInit;

  beforeEach(() => {
    ctx = createDeps();
    ctx.auth.findUserBySession.mockResolvedValue(makeUser());
  });

  describe('GET /api/overview', () => {
    it('2アプリぶんの件数を1往復で返す', async () => {
      ctx.users.countAll.mockResolvedValue(12);
      ctx.requests.countByStatus.mockResolvedValue(3);

      const res = await ctx.app.request('/api/overview', authed);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ users: 12, pendingRequests: 3 });
      expect(ctx.requests.countByStatus).toHaveBeenCalledWith('pending');
    });

    it('未認証なら 401', async () => {
      const { app } = createDeps();

      expect((await app.request('/api/overview')).status).toBe(401);
    });
  });

  describe('GET /api/requests', () => {
    it('limit / cursor / status を core に渡す', async () => {
      ctx.requests.list.mockResolvedValue({ items: [], nextCursor: null });

      const res = await ctx.app.request('/api/requests?limit=3&cursor=c1&status=pending', authed);

      expect(res.status).toBe(200);
      expect(ctx.requests.list).toHaveBeenCalledWith({
        limit: 3,
        cursor: 'c1',
        status: 'pending',
      });
    });

    it('クエリ省略時は絞り込まない', async () => {
      ctx.requests.list.mockResolvedValue({ items: [makeRequest()], nextCursor: null });

      await ctx.app.request('/api/requests', authed);

      expect(ctx.requests.list).toHaveBeenCalledWith({
        limit: undefined,
        cursor: null,
        status: undefined,
      });
    });

    it('status が不正なら 400', async () => {
      const res = await ctx.app.request('/api/requests?status=unknown', authed);

      expect(res.status).toBe(400);
      expect(ctx.requests.list).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/requests', () => {
    it('申請者をサインイン中の本人にして作成し、イベントを記録する', async () => {
      ctx.requests.create.mockResolvedValue(makeRequest());

      const res = await ctx.app.request(
        '/api/requests',
        // クライアントが requesterId を送っても無視されること。
        postJson({ title: '備品購入', amount: 12000, requesterId: OTHER_ID }),
      );

      expect(res.status).toBe(201);
      expect(ctx.requests.create).toHaveBeenCalledWith({
        title: '備品購入',
        amount: 12000,
        requesterId: USER_ID,
      });
      expect(ctx.events.append).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: REQUEST_ID,
          type: 'request.created',
          payload: { title: '備品購入', amount: 12000 },
        }),
      );
    });

    it('金額が数値でなければ 400', async () => {
      const res = await ctx.app.request('/api/requests', postJson({ title: 'x', amount: '12000' }));

      expect(res.status).toBe(400);
      expect(ctx.requests.create).not.toHaveBeenCalled();
    });

    it('core の ValidationError は 400 に変換される', async () => {
      ctx.requests.create.mockRejectedValue(new ValidationError('amount', '金額は1以上で入力してください'));

      const res = await ctx.app.request('/api/requests', postJson({ title: 'x', amount: 0 }));

      expect(res.status).toBe(400);
      expect(ctx.events.append).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/requests/:id', () => {
    it('見つかれば 200', async () => {
      ctx.requests.findById.mockResolvedValue(makeRequest());

      const res = await ctx.app.request(`/api/requests/${REQUEST_ID}`, authed);

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ request: { id: REQUEST_ID } });
    });

    it('見つからなければ 404', async () => {
      ctx.requests.findById.mockResolvedValue(null);

      const res = await ctx.app.request(`/api/requests/${REQUEST_ID}`, authed);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/requests/:id/submit', () => {
    it('提出してイベントを記録する', async () => {
      ctx.requests.submit.mockResolvedValue(makeRequest({ status: 'pending' }));

      const res = await ctx.app.request(`/api/requests/${REQUEST_ID}/submit`, {
        method: 'POST',
        ...authed,
      });

      expect(res.status).toBe(200);
      // 提出者はサインイン中の本人。クライアントからは指定できない。
      expect(ctx.requests.submit).toHaveBeenCalledWith(REQUEST_ID, USER_ID);
      expect(ctx.events.append).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'request.submitted' }),
      );
    });

    it('存在しなければ 404 でイベントも残さない', async () => {
      ctx.requests.submit.mockRejectedValue(new RequestNotFoundError(REQUEST_ID));

      const res = await ctx.app.request(`/api/requests/${REQUEST_ID}/submit`, {
        method: 'POST',
        ...authed,
      });

      expect(res.status).toBe(404);
      expect(ctx.events.append).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/requests/:id/decision', () => {
    it.each([
      ['approved', 'request.approved'],
      ['rejected', 'request.rejected'],
    ] as const)('%s なら %s を記録する', async (decision, eventType) => {
      ctx.requests.decide.mockResolvedValue(makeRequest({ status: decision }));

      const res = await ctx.app.request(
        `/api/requests/${REQUEST_ID}/decision`,
        postJson({ decision }),
      );

      expect(res.status).toBe(200);
      // 決裁者はサインイン中の本人。
      expect(ctx.requests.decide).toHaveBeenCalledWith(REQUEST_ID, decision, USER_ID);
      expect(ctx.events.append).toHaveBeenCalledWith(
        expect.objectContaining({ type: eventType, payload: { decidedBy: USER_ID } }),
      );
    });

    it('決裁値が不正なら 400', async () => {
      const res = await ctx.app.request(
        `/api/requests/${REQUEST_ID}/decision`,
        postJson({ decision: 'maybe' }),
      );

      expect(res.status).toBe(400);
      expect(ctx.requests.decide).not.toHaveBeenCalled();
    });

    it('自分の申請なら core が弾いて 400', async () => {
      ctx.requests.decide.mockRejectedValue(
        new ValidationError('deciderId', '自分が出した申請は決裁できません'),
      );

      const res = await ctx.app.request(
        `/api/requests/${REQUEST_ID}/decision`,
        postJson({ decision: 'approved' }),
      );

      expect(res.status).toBe(400);
      expect(ctx.events.append).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/requests/:id/events', () => {
    it('申請のイベント一覧を返す', async () => {
      ctx.events.listByUser.mockResolvedValue({ items: [], nextCursor: null });

      const res = await ctx.app.request(`/api/requests/${REQUEST_ID}/events?limit=2`, authed);

      expect(res.status).toBe(200);
      expect(ctx.events.listByUser).toHaveBeenCalledWith(REQUEST_ID, { limit: 2, cursor: null });
    });
  });
});
