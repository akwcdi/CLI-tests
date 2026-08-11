import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { toMessage } from '../error-message.ts';
import { formatDateTime, userLabel, userTone } from '../status.ts';
import type { User } from '../types.ts';

const PAGE_SIZE = 5;

export function UsersPage() {
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

  return (
    <AppShell title="ユーザー管理">
      <div className="page__head">
        <h1>ユーザー一覧</h1>
        <p className="page__lead">
          ここに登録された人が、ほかのアプリの申請者・決裁者になります。
        </p>
      </div>

      <form className="form form--inline panel" style={{ padding: 'var(--s4)' }} onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="new-email">メールアドレス</label>
          <input id="new-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-name">名前</label>
          <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new-password">パスワード</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <button type="submit" className="btn btn--primary" disabled={creating}>
            作成
          </button>
        </div>
      </form>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="section">
        {loading ? (
          <p className="loading">読み込み中…</p>
        ) : (
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>メールアドレス</th>
                  <th>状態</th>
                  <th>登録</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className={`rail rail--${userTone(user.status)}`} aria-hidden="true" />
                      <Link className="table__name" to={`/users/${user.id}`}>
                        {user.name}
                      </Link>
                    </td>
                    <td className="data">{user.email}</td>
                    <td>
                      <span className={`status status--${userTone(user.status)}`}>
                        {userLabel(user.status)}
                      </span>
                    </td>
                    <td className="data">{formatDateTime(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pager">
          <button
            type="button"
            className="btn"
            onClick={() => setCursor(null)}
            disabled={cursor === null}
          >
            先頭へ
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setCursor(nextCursor)}
            disabled={nextCursor === null}
          >
            次へ
          </button>
        </div>
      </div>
    </AppShell>
  );
}
