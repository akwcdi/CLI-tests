import '@testing-library/jest-dom/vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, vi } from 'vitest';

// globals:false なので testing-library の自動クリーンアップが登録されない。
// 明示的に呼ばないと前のテストの DOM が残り、getBy* が重複で落ちる。
afterEach(() => {
  cleanup();
});

import type { User, UserEvent } from '../src/types.ts';

/** api モジュール全体のモック。ApiError は本物を残す（instanceof 判定に使うため）。 */
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
};

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'user@example.com',
    name: 'Taro',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<UserEvent> = {}): UserEvent {
  return {
    userId: 'u1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    type: 'user.created',
    payload: {},
    ...overrides,
  };
}

/**
 * 遷移先を検証できる形で描画する。
 * `/login` と `/users` にはマーカーだけの画面を置いてある。
 */
export function renderAt(
  ui: ReactElement,
  path = '/',
  routePath = '/',
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={ui} />
        <Route path="/login" element={<p>ログイン画面</p>} />
        <Route path="/users" element={<p>一覧画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
