import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, vi } from 'vitest';

import { RequireSession } from '../src/session.tsx';
import { apiMock } from './api-mock.ts';

// 呼び出し側の利便のため再エクスポートする（定義は api-mock.ts）。
export { apiMock };

import type { ApprovalRequest, User, UserEvent } from '../src/types.ts';

// globals:false なので testing-library の自動クリーンアップが登録されない。
// 明示的に呼ばないと前のテストの DOM が残り、getBy* が重複で落ちる。
afterEach(() => {
  cleanup();
});


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

export function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'r1',
    title: '備品購入',
    amount: 12000,
    status: 'draft',
    requester_id: 'u1',
    requester_name: 'Taro',
    decided_by: null,
    decider_name: null,
    created_at: '2026-01-01T00:00:00.000Z',
    decided_at: null,
    ...overrides,
  };
}

/**
 * 遷移先を検証できる形で描画する。
 * `/login` `/users` `/requests` にはマーカーだけの画面を置いてある。
 */
/** 遷移先の確認用に置くマーカー画面。 */
const MARKERS: [string, string][] = [
  ['/login', 'ログイン画面'],
  ['/users', '一覧画面'],
  ['/requests', '申請一覧画面'],
  ['/', 'アプリトップ'],
];

/**
 * 遷移先を検証できる形で描画する。
 * 対象の画面と同じパスのマーカーは、経路が重複しないよう外す。
 */
export function renderAt(ui: ReactElement, path = '/', routePath = '/'): RenderResult {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={ui} />
        {MARKERS.filter(([markerPath]) => markerPath !== routePath).map(([markerPath, label]) => (
          <Route key={markerPath} path={markerPath} element={<p>{label}</p>} />
        ))}
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * AppShell を含む画面用。RequireSession を通すので、
 * 呼ぶ前に `apiMock.me` を解決させておくこと（既定値はここで入れる）。
 * 上部バーが出るまで待ってから返る。
 */
export async function renderInShell(
  ui: ReactElement,
  path = '/',
  routePath = '/',
  signedInAs: User = makeUser({ name: 'サインイン中の人' }),
): Promise<RenderResult> {
  apiMock.me.mockResolvedValue(signedInAs);
  const rendered = renderAt(<RequireSession>{ui}</RequireSession>, path, routePath);
  // 上部バーが出れば、セッション確認が終わって本体が描かれている。
  await screen.findByRole('banner');
  return rendered;
}
