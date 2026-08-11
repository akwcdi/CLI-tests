import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api } from '../api.ts';
import { toMessage } from '../error-message.ts';
import type { User, UserEvent, UserStatus } from '../types.ts';

const STATUS_LABEL = { active: '有効', suspended: '停止中' } as const;

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
  // ここで user の null チェックをすると UI から到達できない分岐になる。
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

  if (loading) {
    return <p>読み込み中…</p>;
  }

  return (
    <main>
      <Link to="/users">一覧へ戻る</Link>

      {error !== null && <p role="alert">{error}</p>}

      {user === null ? (
        <p>ユーザーが見つかりません</p>
      ) : (
        <>
          <h1>{user.name}</h1>
          <dl>
            <dt>メールアドレス</dt>
            <dd>{user.email}</dd>
            <dt>状態</dt>
            <dd data-testid="status">{STATUS_LABEL[user.status]}</dd>
          </dl>

          <button type="button" disabled={busy} onClick={() => void handleToggleStatus(user.status)}>
            {user.status === 'active' ? '停止する' : '再開する'}
          </button>
          <button type="button" disabled={busy} onClick={() => void handleDelete()}>
            削除する
          </button>

          <h2>操作履歴</h2>
          {events.length === 0 ? (
            <p>履歴はありません</p>
          ) : (
            <ul>
              {events.map((event) => (
                <li key={`${event.occurredAt}-${event.type}`}>
                  <time dateTime={event.occurredAt}>{event.occurredAt}</time> {event.type}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
