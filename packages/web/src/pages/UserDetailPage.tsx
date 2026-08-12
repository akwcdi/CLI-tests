import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { toMessage } from '../error-message.ts';
import {
  eventLabel,
  eventTone,
  formatDateTime,
  userLabel,
  userTone,
} from '../status.ts';
import type { User, UserEvent, UserStatus } from '../types.ts';

export function UserDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // 2ストアから引くが、画面としては1つの状態として見せる。
      const [found, page] = await Promise.all([api.getUser(id), api.listEvents(id)]);
      setUser(found);
      setEvents(page.items);
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 現在の状態は呼び出し側（user が確定している場所）から渡す。
  async function handleToggleStatus(current: UserStatus): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.updateStatus(id, current === 'active' ? 'suspended' : 'active');
      await load();
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.deleteUser(id);
      navigate('/users');
    } catch (caught) {
      setError(toMessage(caught));
      setBusy(false);
    }
  }

  return (
    <AppShell title="ユーザー管理">
      <p>
        <Link to="/users">一覧へ戻る</Link>
      </p>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="loading">読み込み中…</p>
      ) : user === null ? (
        <p className="empty">ユーザーが見つかりません。</p>
      ) : (
        <>
          <div className="page__head">
            <h1>{user.name}</h1>
            <span
              data-testid="status"
              className={`status status--${userTone(user.status)}`}
            >
              {userLabel(user.status)}
            </span>
          </div>

          <div className="panel" style={{ padding: 'var(--s5)' }}>
            <dl className="facts">
              <dt>メールアドレス</dt>
              <dd className="data data--strong">{user.email}</dd>
              <dt>登録</dt>
              <dd className="data">{formatDateTime(user.created_at)}</dd>
            </dl>

            <div className="btn-row" style={{ marginTop: 'var(--s5)' }}>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void handleToggleStatus(user.status)}
              >
                {user.status === 'active' ? '停止する' : '再開する'}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                削除する
              </button>
            </div>
          </div>

          <div className="section">
            <div className="section__head">
              <h2>操作履歴</h2>
            </div>
            {events.length === 0 ? (
              <p className="empty">履歴はありません。</p>
            ) : (
              <ol className="trail">
                {events.map((event) => (
                  <li
                    key={`${event.occurredAt}-${event.type}`}
                    className={`trail__item trail__item--${eventTone(event.type)}`}
                  >
                    <span className="trail__label">{eventLabel(event.type)}</span>
                    <br />
                    <time className="data" dateTime={event.occurredAt}>
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
