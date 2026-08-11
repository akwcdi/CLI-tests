import type { ApiErrorBody, Page, User, UserEvent, UserStatus } from './types.ts';

/** API がエラー応答を返したときに投げられる。画面はこの message を出す。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.field = body.field;
  }
}

/** 応答が JSON で無い場合の保険。サーバーが落ちているときなど。 */
const FALLBACK_ERROR = { code: 'unknown_error', message: 'サーバーとの通信に失敗しました' };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    // セッション Cookie を必ず送る。
    credentials: 'same-origin',
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(response.status, body?.error ?? FALLBACK_ERROR);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  async login(email: string, password: string): Promise<User> {
    const { user } = await request<{ user: User }>('/api/login', jsonInit('POST', { email, password }));
    return user;
  },

  async logout(): Promise<void> {
    await request<void>('/api/logout', { method: 'POST' });
  },

  async me(): Promise<User> {
    const { user } = await request<{ user: User }>('/api/me');
    return user;
  },

  listUsers(options: { limit?: number; cursor?: string | null } = {}): Promise<Page<User>> {
    const query = new URLSearchParams();
    if (options.limit !== undefined) {
      query.set('limit', String(options.limit));
    }
    if (options.cursor !== undefined && options.cursor !== null) {
      query.set('cursor', options.cursor);
    }
    const suffix = query.size === 0 ? '' : `?${query.toString()}`;
    return request<Page<User>>(`/api/users${suffix}`);
  },

  async createUser(input: { email: string; name: string; password: string }): Promise<User> {
    const { user } = await request<{ user: User }>('/api/users', jsonInit('POST', input));
    return user;
  },

  async getUser(id: string): Promise<User> {
    const { user } = await request<{ user: User }>(`/api/users/${id}`);
    return user;
  },

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const { user } = await request<{ user: User }>(
      `/api/users/${id}/status`,
      jsonInit('PATCH', { status }),
    );
    return user;
  },

  async deleteUser(id: string): Promise<void> {
    await request<void>(`/api/users/${id}`, { method: 'DELETE' });
  },

  listEvents(id: string): Promise<Page<UserEvent>> {
    return request<Page<UserEvent>>(`/api/users/${id}/events`);
  },
};
