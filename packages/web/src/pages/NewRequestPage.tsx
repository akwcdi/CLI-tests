import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { toMessage } from '../error-message.ts';

export function NewRequestPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      // 整数に読めない入力はここで止める。NaN を送ると JSON では null になり、
      // API が core を通らず英語の "amount must be a number" を返すため。
      const parsed = Number(amount);
      if (!Number.isInteger(parsed)) {
        setError('金額は整数で入力してください');
        return;
      }
      const created = await api.createRequest({ title, amount: parsed });
      // 下書きの次の行動は提出なので、一覧ではなく作ったものの詳細へ送る。
      navigate(`/requests/${created.id}`);
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell title="申請管理">
      <p>
        <Link to="/requests">一覧へ戻る</Link>
      </p>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="page__head">
        <h1>申請の下書き</h1>
        <p className="page__lead">件名と金額を入れて下書きを作ります。提出は次の画面から。</p>
      </div>

      <form className="form form--page panel" style={{ padding: 'var(--s5)' }} onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="req-title">件名</label>
          <input id="req-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="field field--data">
          <label htmlFor="req-amount">金額</label>
          <input
            id="req-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className="field__hint">円・整数</span>
        </div>

        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={creating}>
            下書きを作る
          </button>
        </div>
      </form>
    </AppShell>
  );
}
