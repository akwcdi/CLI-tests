import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api.ts';
import { toMessage } from '../error-message.ts';
import type { User } from '../types.ts';

const PAGE_SIZE = 5;

const STATUS_LABEL = { active: '有効', suspended: '停止中' } as const;

export function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (from: string | null): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listUsers({ limit: PAGE_SIZE, cursor: from });
      setUsers(page.items);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(cursor);
  }, [load, cursor]);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createUser({ email, name, password });
      setEmail('');
      setName('');
      setPassword('');
      // 追加した行が見えるよう先頭ページに戻す。
      if (cursor === null) {
        await load(null);
      } else {
        setCursor(null);
      }
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await api.logout();
    navigate('/login');
  }

  return (
    <main>
      <h1>ユーザー一覧</h1>
      <button type="button" onClick={() => void handleLogout()}>
        ログアウト
      </button>

      <form onSubmit={handleCreate}>
        <h2>新規ユーザー</h2>
        <label htmlFor="new-email">メールアドレス</label>
        <input id="new-email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="new-name">名前</label>
        <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="new-password">パスワード</label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" disabled={creating}>
          作成
        </button>
      </form>

      {error !== null && <p role="alert">{error}</p>}

      {loading ? (
        <p>読み込み中…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>名前</th>
              <th>メールアドレス</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link to={`/users/${user.id}`}>{user.name}</Link>
                </td>
                <td>{user.email}</td>
                <td>{STATUS_LABEL[user.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <nav>
        <button type="button" onClick={() => setCursor(null)} disabled={cursor === null}>
          先頭へ
        </button>
        <button
          type="button"
          onClick={() => setCursor(nextCursor)}
          disabled={nextCursor === null}
        >
          次へ
        </button>
      </nav>
    </main>
  );
}
