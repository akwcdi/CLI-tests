import { useState, type KeyboardEvent } from 'react';

import { initials } from '../status.ts';
import type { User } from '../types.ts';

/**
 * 右上のサインイン中ユーザー。押すとメニューが開く。
 *
 * 外側クリックの検出に document のリスナではなく背面の要素を使っている。
 * リスナ方式は ref が null になる到達不能な分岐を生むうえ、
 * どのイベントで閉じるかがコードから読み取りにくい。
 *
 * 既知の制限: Escape で閉じたあと、フォーカスはトリガーに戻さない。
 */
export function UserMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="usermenu" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="usermenu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="usermenu__name">{user.name}</span>
        <span className="usermenu__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <>
          <div
            className="usermenu__backdrop"
            data-testid="usermenu-backdrop"
            onClick={() => setOpen(false)}
          />
          <div className="usermenu__panel" role="menu">
            <div className="usermenu__identity">
              <strong>{user.name}</strong>
              <span className="data">{user.email}</span>
            </div>
            <a className="usermenu__item" role="menuitem" href={`/users/${user.id}`}>
              自分のアカウント
            </a>
            <button
              type="button"
              className="usermenu__item usermenu__item--danger"
              role="menuitem"
              onClick={onSignOut}
            >
              サインアウト
            </button>
          </div>
        </>
      )}
    </div>
  );
}
