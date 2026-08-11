import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { api } from './api.ts';

type AuthState = 'checking' | 'signed-in' | 'signed-out';

/**
 * セッションが有効なときだけ children を描画する。
 * 判定中に children を出すと未認証の内容が一瞬見えるので、必ず待つ。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('checking');

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then(() => {
        if (alive) {
          setState('signed-in');
        }
      })
      .catch(() => {
        if (alive) {
          setState('signed-out');
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'checking') {
    return <p>読み込み中…</p>;
  }
  if (state === 'signed-out') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
