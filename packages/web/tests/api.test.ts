import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '../src/api.ts';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** JSON を返す成功応答。 */
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const noContent = () => new Response(null, { status: 204 });

const fail = (status: number, error: { code: string; message: string; field?: string }) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const USER = {
  id: 'u1',
  email: 'user@example.com',
  name: 'Taro',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00.000Z',
};

/** 直近の fetch 呼び出しの [path, init]。 */
const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? [];

describe('ApiError', () => {
  it('status / code / field を保持する', () => {
    const error = new ApiError(400, { code: 'validation_error', message: 'bad', field: 'email' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(400);
    expect(error.code).toBe('validation_error');
    expect(error.field).toBe('email');
    expect(error.message).toBe('bad');
  });

  it('field は省略できる', () => {
    expect(new ApiError(500, { code: 'internal_error', message: 'oops' }).field).toBeUndefined();
  });
});

describe('共通の振る舞い', () => {
  it('Cookie を送るよう credential を指定する', async () => {
    fetchMock.mockResolvedValue(ok({ user: USER }));

    await api.me();

    expect(lastCall()[1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('エラー応答は ApiError になる', async () => {
    fetchMock.mockResolvedValue(fail(404, { code: 'not_found', message: 'user not found: u9' }));

    await expect(api.getUser('u9')).rejects.toThrowError(
      new ApiError(404, { code: 'not_found', message: 'user not found: u9' }),
    );
  });

  it('エラー応答が JSON でなくても ApiError になる', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));

    await expect(api.me()).rejects.toMatchObject({
      status: 502,
      code: 'unknown_error',
      message: 'サーバーとの通信に失敗しました',
    });
  });
});

describe('api.login', () => {
  it('email と password を送り、ユーザーを返す', async () => {
    fetchMock.mockResolvedValue(ok({ user: USER }));

    await expect(api.login('user@example.com', 'password123')).resolves.toEqual(USER);

    const [path, init] = lastCall();
    expect(path).toBe('/api/login');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'user@example.com',
      password: 'password123',
    });
  });

  it('401 なら ApiError', async () => {
    fetchMock.mockResolvedValue(
      fail(401, { code: 'unauthorized', message: 'email or password is incorrect' }),
    );

    await expect(api.login('user@example.com', 'nope')).rejects.toThrow(ApiError);
  });
});

describe('api.logout', () => {
  it('204 を undefined として扱う', async () => {
    fetchMock.mockResolvedValue(noContent());

    await expect(api.logout()).resolves.toBeUndefined();
    expect(lastCall()[1]).toMatchObject({ method: 'POST' });
  });
});

describe('api.listUsers', () => {
  it('引数なしならクエリを付けない', async () => {
    fetchMock.mockResolvedValue(ok({ items: [], nextCursor: null }));

    await api.listUsers();

    expect(lastCall()[0]).toBe('/api/users');
  });

  it('limit と cursor をクエリにする', async () => {
    fetchMock.mockResolvedValue(ok({ items: [USER], nextCursor: 'c1' }));

    await expect(api.listUsers({ limit: 5, cursor: 'c0' })).resolves.toEqual({
      items: [USER],
      nextCursor: 'c1',
    });
    expect(lastCall()[0]).toBe('/api/users?limit=5&cursor=c0');
  });

  it('cursor が null ならクエリに載せない', async () => {
    fetchMock.mockResolvedValue(ok({ items: [], nextCursor: null }));

    await api.listUsers({ limit: 5, cursor: null });

    expect(lastCall()[0]).toBe('/api/users?limit=5');
  });
});

describe('api.createUser', () => {
  it('POST して作成されたユーザーを返す', async () => {
    fetchMock.mockResolvedValue(ok({ user: USER }, 201));

    await expect(
      api.createUser({ email: 'a@example.com', name: 'A', password: 'password123' }),
    ).resolves.toEqual(USER);
    expect(lastCall()[0]).toBe('/api/users');
  });
});

describe('api.getUser', () => {
  it('id を URL に埋める', async () => {
    fetchMock.mockResolvedValue(ok({ user: USER }));

    await expect(api.getUser('u1')).resolves.toEqual(USER);
    expect(lastCall()[0]).toBe('/api/users/u1');
  });
});

describe('api.updateStatus', () => {
  it('PATCH で status を送る', async () => {
    fetchMock.mockResolvedValue(ok({ user: { ...USER, status: 'suspended' } }));

    await expect(api.updateStatus('u1', 'suspended')).resolves.toMatchObject({
      status: 'suspended',
    });

    const [path, init] = lastCall();
    expect(path).toBe('/api/users/u1/status');
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'suspended' });
  });
});

describe('api.deleteUser', () => {
  it('DELETE して 204 を受ける', async () => {
    fetchMock.mockResolvedValue(noContent());

    await expect(api.deleteUser('u1')).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject(['/api/users/u1', { method: 'DELETE' }]);
  });
});

describe('api.listEvents', () => {
  it('イベント一覧を取得する', async () => {
    const event = {
      userId: 'u1',
      occurredAt: '2026-01-01T00:00:00.000Z',
      type: 'user.created',
      payload: {},
    };
    fetchMock.mockResolvedValue(ok({ items: [event], nextCursor: null }));

    await expect(api.listEvents('u1')).resolves.toEqual({ items: [event], nextCursor: null });
    expect(lastCall()[0]).toBe('/api/users/u1/events');
  });
});

const REQ = {
  id: 'r1',
  title: '備品購入',
  amount: 12000,
  status: 'draft' as const,
  requester_id: 'u1',
  requester_name: 'Taro',
  decided_by: null,
  decider_name: null,
  created_at: '2026-01-01T00:00:00.000Z',
  decided_at: null,
};

describe('api.overview', () => {
  it('指標を取得する', async () => {
    fetchMock.mockResolvedValue(ok({ users: 12, pendingRequests: 3 }));

    await expect(api.overview()).resolves.toEqual({ users: 12, pendingRequests: 3 });
    expect(lastCall()[0]).toBe('/api/overview');
  });
});

describe('api.listRequests', () => {
  it('引数なしならクエリを付けない', async () => {
    fetchMock.mockResolvedValue(ok({ items: [], nextCursor: null }));

    await api.listRequests();

    expect(lastCall()[0]).toBe('/api/requests');
  });

  it('limit / cursor / status をクエリにする', async () => {
    fetchMock.mockResolvedValue(ok({ items: [REQ], nextCursor: 'c1' }));

    await expect(api.listRequests({ limit: 5, cursor: 'c0', status: 'pending' })).resolves.toEqual({
      items: [REQ],
      nextCursor: 'c1',
    });
    expect(lastCall()[0]).toBe('/api/requests?limit=5&cursor=c0&status=pending');
  });

  it('cursor が null ならクエリに載せない', async () => {
    fetchMock.mockResolvedValue(ok({ items: [], nextCursor: null }));

    await api.listRequests({ limit: 5, cursor: null });

    expect(lastCall()[0]).toBe('/api/requests?limit=5');
  });
});

describe('api.createRequest', () => {
  it('POST して作成された申請を返す', async () => {
    fetchMock.mockResolvedValue(ok({ request: REQ }, 201));

    await expect(api.createRequest({ title: '備品購入', amount: 12000 })).resolves.toEqual(REQ);

    const [path, init] = lastCall();
    expect(path).toBe('/api/requests');
    expect(JSON.parse(String(init?.body))).toEqual({ title: '備品購入', amount: 12000 });
  });
});

describe('api.getRequest', () => {
  it('id を URL に埋める', async () => {
    fetchMock.mockResolvedValue(ok({ request: REQ }));

    await expect(api.getRequest('r1')).resolves.toEqual(REQ);
    expect(lastCall()[0]).toBe('/api/requests/r1');
  });
});

describe('api.submitRequest', () => {
  it('POST で提出する', async () => {
    fetchMock.mockResolvedValue(ok({ request: { ...REQ, status: 'pending' } }));

    await expect(api.submitRequest('r1')).resolves.toMatchObject({ status: 'pending' });
    expect(lastCall()).toMatchObject(['/api/requests/r1/submit', { method: 'POST' }]);
  });
});

describe('api.decideRequest', () => {
  it.each([['approved'], ['rejected']] as const)('%s を送る', async (decision) => {
    fetchMock.mockResolvedValue(ok({ request: { ...REQ, status: decision } }));

    await expect(api.decideRequest('r1', decision)).resolves.toMatchObject({ status: decision });

    const [path, init] = lastCall();
    expect(path).toBe('/api/requests/r1/decision');
    expect(JSON.parse(String(init?.body))).toEqual({ decision });
  });
});

describe('api.listRequestEvents', () => {
  it('申請のイベントを取得する', async () => {
    fetchMock.mockResolvedValue(ok({ items: [], nextCursor: null }));

    await expect(api.listRequestEvents('r1')).resolves.toEqual({ items: [], nextCursor: null });
    expect(lastCall()[0]).toBe('/api/requests/r1/events');
  });
});
