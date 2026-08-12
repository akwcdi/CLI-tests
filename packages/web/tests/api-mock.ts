import { vi } from 'vitest';

/**
 * api モジュール全体のモック。
 *
 * src の何もインポートしないこと。vi.mock のファクトリはファイル先頭へ
 * 巻き上げられるため、ここが src を経由すると初期化が循環する。
 */
export const apiMock = {
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  getUser: vi.fn(),
  updateStatus: vi.fn(),
  deleteUser: vi.fn(),
  listEvents: vi.fn(),
  overview: vi.fn(),
  listRequests: vi.fn(),
  createRequest: vi.fn(),
  getRequest: vi.fn(),
  submitRequest: vi.fn(),
  decideRequest: vi.fn(),
  listRequestEvents: vi.fn(),
};
