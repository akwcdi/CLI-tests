import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api.ts';
import { useSession } from '../session.tsx';
import { UserMenu } from './UserMenu.tsx';

/** 製品マーク。状態レールと同じ語彙（3 本の帯）で作ってある。 */
export function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * サインイン後の共通枠。上部バーと本文。
 * `title` を渡すと製品名の右に現在地として出る。アプリトップでは省く。
 */
export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const user = useSession();
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    await api.logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__home">
          <Mark />
          オペレーション基盤
        </Link>
        {title !== undefined && (
          <>
            <span className="topbar__sep" aria-hidden="true">
              /
            </span>
            <span className="topbar__context">{title}</span>
          </>
        )}
        <span className="topbar__spacer" />
        <UserMenu user={user} onSignOut={() => void handleSignOut()} />
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
