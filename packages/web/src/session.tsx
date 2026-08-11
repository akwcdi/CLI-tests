import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { api } from './api.ts';
import type { User } from './types.ts';

const SessionContext = createContext<User | null>(null);

/**
 * サインイン中のユーザー。{@link RequireSession} の内側でのみ使える。
 * 外side で呼ぶと、原因の分かる形で落とす。
 */
export function useSession(): User {
  const user = useContext(SessionContext);
  if (user === null) {
    throw new Error('useSession(): RequireSession の内側で呼んでください');
  }
  return user;
}

type State =
  | { status: 'checking' }
  | { status: 'signed-in'; user: User }
  | { status: 'signed-out' };

/**
 * セッションを確認し、有効なときだけ children を描画する。
 * 判定中に children を出すと未認証の内容が一瞬見えるので、必ず待つ。
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'checking' });

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((user) => {
        if (alive) {
          setState({ status: 'signed-in', user });
        }
      })
      .catch(() => {
        if (alive) {
          setState({ status: 'signed-out' });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === 'checking') {
    return <p className="loading">読み込み中…</p>;
  }
  if (state.status === 'signed-out') {
    return <Navigate to="/login" replace />;
  }
  return <SessionContext.Provider value={state.user}>{children}</SessionContext.Provider>;
}
