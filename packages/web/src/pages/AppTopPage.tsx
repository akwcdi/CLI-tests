import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { toMessage } from '../error-message.ts';
import { useSession } from '../session.tsx';
import type { Overview } from '../types.ts';

/**
 * サインイン後の着地点。どのアプリに入るかを選ぶ場所で、
 * それぞれ「今どれだけ溜まっているか」を 1 つだけ添える。
 * 数字は機械が出した値なので等幅で組む。
 */
export function AppTopPage() {
  const user = useSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .overview()
      .then((next) => {
        if (alive) {
          setOverview(next);
        }
      })
      .catch((caught: unknown) => {
        if (alive) {
          setError(toMessage(caught));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell>
      <div className="page__head">
        <h1>{user.name} さん</h1>
        <p className="page__lead">担当しているアプリです。</p>
      </div>

      {error !== null && <p className="alert" role="alert">{error}</p>}

      <div className="launcher">
        <Link className="applink" to="/users">
          <span className="rail rail--neutral" aria-hidden="true" />
          <span className="applink__name">ユーザー管理</span>
          <p className="applink__desc">
            アカウントの登録と利用状態。ほかのアプリはここの利用者を参照します。
          </p>
          <span className="applink__metric">
            <span className="applink__count">{overview?.users ?? '—'}</span>
            <span className="applink__unit">人が登録済み</span>
          </span>
        </Link>

        <Link className="applink" to="/requests">
          <span className="rail rail--pending" aria-hidden="true" />
          <span className="applink__name">申請管理</span>
          <p className="applink__desc">
            金額をともなう申請の提出と決裁。自分が出した申請は決裁できません。
          </p>
          <span className="applink__metric">
            <span className="applink__count">{overview?.pendingRequests ?? '—'}</span>
            <span className="applink__unit">件が承認待ち</span>
          </span>
        </Link>
      </div>
    </AppShell>
  );
}
