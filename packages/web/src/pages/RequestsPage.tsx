import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { toMessage } from '../error-message.ts';
import { formatAmount, formatDateTime, personName, requestLabel, requestTone } from '../status.ts';
import type { ApprovalRequest, RequestStatus } from '../types.ts';

const PAGE_SIZE = 5;

const FILTERS: { value: RequestStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'draft', label: '下書き' },
  { value: 'pending', label: '承認待ち' },
  { value: 'approved', label: '承認済み' },
  { value: 'rejected', label: '却下' },
];

export function RequestsPage() {
  const [items, setItems] = useState<ApprovalRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (from: string | null, status: RequestStatus | 'all'): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const page = await api.listRequests({
          limit: PAGE_SIZE,
          cursor: from,
          status: status === 'all' ? undefined : status,
        });
        setItems(page.items);
        setNextCursor(page.nextCursor);
      } catch (caught) {
        setError(toMessage(caught));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(cursor, filter);
  }, [load, cursor, filter]);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createRequest({ title, amount: Number(amount) });
      setTitle('');
      setAmount('');
      if (cursor === null) {
        await load(null, filter);
      } else {
        setCursor(null);
      }
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setCreating(false);
    }
  }

  function changeFilter(next: RequestStatus | 'all'): void {
    setCursor(null);
    setFilter(next);
  }

  return (
    <AppShell title="申請管理">
      <div className="page__head">
        <h1>申請</h1>
        <p className="page__lead">
          下書きを作って承認へ回します。自分が出した申請は自分で決裁できません。
        </p>
      </div>

      <form className="form form--inline panel" style={{ padding: 'var(--s4)' }} onSubmit={handleCreate}>
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
        <div>
          <button type="submit" className="btn btn--primary" disabled={creating}>
            下書きを作る
          </button>
        </div>
      </form>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="section">
        <div className="section__head">
          <h2>一覧</h2>
          <div className="btn-row">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="btn"
                aria-pressed={filter === option.value}
                onClick={() => changeFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="loading">読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="empty">該当する申請はありません。</p>
        ) : (
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th>件名</th>
                  <th>申請者</th>
                  <th>金額</th>
                  <th>状態</th>
                  <th>作成</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span
                        className={`rail rail--${requestTone(item.status)}`}
                        aria-hidden="true"
                      />
                      <Link className="table__name" to={`/requests/${item.id}`}>
                        {item.title}
                      </Link>
                    </td>
                    <td>{personName(item.requester_name)}</td>
                    <td className="data data--strong">{formatAmount(item.amount)}</td>
                    <td>
                      <span className={`status status--${requestTone(item.status)}`}>
                        {requestLabel(item.status)}
                      </span>
                    </td>
                    <td className="data">{formatDateTime(item.created_at)}</td>
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
