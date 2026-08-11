import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api.ts';
import { Mark } from '../components/AppShell.tsx';
import { toMessage } from '../error-message.ts';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      navigate('/');
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <div className="signin__card">
        <div className="signin__brand">
          <Mark />
          <span>オペレーション基盤</span>
        </div>

        <h1 className="signin__title">ログイン</h1>
        <p className="signin__lead">社内アカウントで続けます。</p>

        {error !== null && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">メールアドレス</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">パスワード</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn--primary" disabled={busy}>
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
