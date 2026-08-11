import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { toMessage } from '../error-message.ts';
import {
  eventLabel,
  eventTone,
  formatAmount,
  formatDateTime,
  requestLabel,
  requestTone,
} from '../status.ts';
import type { ApprovalRequest, UserEvent } from '../types.ts';

export function RequestDetailPage() {
  const { id = '' } = useParams<{ id: string }>();

  const [item, setItem] = useState<ApprovalRequest | null>(null);
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [found, page] = await Promise.all([api.getRequest(id), api.listRequestEvents(id)]);
      setItem(found);
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

  /** 提出・承認・却下はどれも「動かして読み直す」だけなので1つにまとめる。 */
  async function act(run: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await run();
      await load();
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setBusy(false);
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

      {loading ? (
        <p className="loading">読み込み中…</p>
      ) : item === null ? (
        <p className="empty">申請が見つかりません。</p>
      ) : (
        <>
          <div className="page__head">
            <h1>{item.title}</h1>
            <span className={`status status--${requestTone(item.status)}`}>
              {requestLabel(item.status)}
            </span>
          </div>

          <div className="panel" style={{ padding: 'var(--s5)' }}>
            <dl className="facts">
              <dt>金額</dt>
              <dd className="data data--strong">{formatAmount(item.amount)}</dd>
              <dt>申請者</dt>
              <dd>{item.requester_name}</dd>
              <dt>作成</dt>
              <dd className="data">{formatDateTime(item.created_at)}</dd>
              <dt>決裁</dt>
              <dd>
                {item.decided_at === null ? (
                  <span className="data">未決裁</span>
                ) : (
                  <>
                    {item.decider_name ?? '（削除済みの利用者）'}{' '}
                    <span className="data">{formatDateTime(item.decided_at)}</span>
                  </>
                )}
              </dd>
            </dl>

            <div className="btn-row" style={{ marginTop: 'var(--s5)' }}>
              {item.status === 'draft' && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void act(() => api.submitRequest(id))}
                >
                  承認へ回す
                </button>
              )}
              {item.status === 'pending' && (
                <>
                  <button
                    type="button"
                    className="btn btn--approve"
                    disabled={busy}
                    onClick={() => void act(() => api.decideRequest(id, 'approved'))}
                  >
                    承認する
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={busy}
                    onClick={() => void act(() => api.decideRequest(id, 'rejected'))}
                  >
                    却下する
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="section">
            <div className="section__head">
              <h2>経過</h2>
            </div>
            {events.length === 0 ? (
              <p className="empty">記録はありません。</p>
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
