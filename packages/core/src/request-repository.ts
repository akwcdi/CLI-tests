import { decodeCursor, encodeCursor, InvalidCursorError } from './cursor.ts';
import { canTransitionRequest, validateNewRequest } from './request.ts';
import type { NewRequest, Page, RequestStatus, RequestWithNames } from './types.ts';
import type { Queryable } from './user-repository.ts';
import { ValidationError } from './user.ts';

/** 対象の申請が見つからなかったときに投げられる。 */
export class RequestNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`request not found: ${id}`);
    this.name = 'RequestNotFoundError';
    this.id = id;
  }
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * 申請者名・決裁者名を添えて取得する共通の SELECT。
 *
 * 申請者側も LEFT JOIN。内部結合にすると、アカウントを消した人の申請が
 * 一覧から丸ごと消え、件数だけが黙って減る。
 */
const SELECT_WITH_NAMES = `
  SELECT r.id, r.title, r.amount, r.status, r.requester_id, r.decided_by,
         r.created_at, r.decided_at,
         requester.name AS requester_name,
         decider.name   AS decider_name
    FROM requests r
    LEFT JOIN users requester ON requester.id = r.requester_id
    LEFT JOIN users decider ON decider.id = r.decided_by`;

interface RequestCursor {
  created_at: string;
  id: string;
}

function parseRequestCursor(cursor: string): RequestCursor {
  const decoded = decodeCursor(cursor);
  if (
    decoded === null ||
    typeof decoded['created_at'] !== 'string' ||
    typeof decoded['id'] !== 'string'
  ) {
    throw new InvalidCursorError(cursor);
  }
  return { created_at: decoded['created_at'], id: decoded['id'] };
}

export class RequestRepository {
  readonly #db: Queryable;

  constructor(db: Queryable) {
    this.#db = db;
  }

  /** 下書きとして1件作る。作成直後は必ず draft。 */
  async create(input: NewRequest): Promise<RequestWithNames> {
    const valid = validateNewRequest(input);

    const inserted = await this.#db.query<{ id: string }>(
      `INSERT INTO requests (title, amount, requester_id, status)
       VALUES ($1, $2, $3, 'draft')
       RETURNING id`,
      [valid.title, valid.amount, valid.requesterId],
    );

    const row = inserted.rows[0];
    if (row === undefined) {
      throw new Error('INSERT returned no request row');
    }
    return this.#requireById(row.id);
  }

  async findById(id: string): Promise<RequestWithNames | null> {
    const result = await this.#db.query<RequestWithNames>(
      `${SELECT_WITH_NAMES} WHERE r.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async #requireById(id: string): Promise<RequestWithNames> {
    const found = await this.findById(id);
    if (found === null) {
      throw new RequestNotFoundError(id);
    }
    return found;
  }

  /**
   * created_at の降順で一覧を返す。`status` で絞り込める。
   * カーソルは (created_at, id) の複合。
   */
  async list(
    options: { limit?: number; cursor?: string | null; status?: RequestStatus } = {},
  ): Promise<Page<RequestWithNames>> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const cursor = options.cursor ?? null;
    const key = cursor === null ? null : parseRequestCursor(cursor);
    const status = options.status ?? null;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status !== null) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (key !== null) {
      params.push(key.created_at, key.id);
      conditions.push(`(r.created_at, r.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
    }
    params.push(limit + 1);

    const where = conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`;
    const result = await this.#db.query<RequestWithNames>(
      `${SELECT_WITH_NAMES}${where}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $${params.length}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        last !== undefined && hasMore
          ? encodeCursor({ created_at: last.created_at.toISOString(), id: last.id })
          : null,
    };
  }

  /**
   * 下書きを承認へ回す。提出できるのは申請者本人だけ。
   *
   * ここで持ち主を見ないと、他人の下書きを提出してから自分で承認でき、
   * 「自分が出した申請は決裁できない」が単独で回避できてしまう。
   */
  async submit(id: string, requesterId: string): Promise<RequestWithNames> {
    const current = await this.#requireById(id);
    if (current.requester_id !== requesterId) {
      throw new ValidationError('requesterId', '他人の申請は提出できません');
    }
    this.#assertTransition(current.status, 'pending');

    await this.#updateStatus(id, current.status, `SET status = 'pending'`, []);
    return this.#requireById(id);
  }

  /**
   * 承認または却下する。
   * 自分の申請は決裁できない（deciderId が申請者と同じなら拒否）。
   */
  async decide(
    id: string,
    next: 'approved' | 'rejected',
    deciderId: string,
    now: Date = new Date(),
  ): Promise<RequestWithNames> {
    const current = await this.#requireById(id);
    this.#assertTransition(current.status, next);

    if (current.requester_id === deciderId) {
      throw new ValidationError('deciderId', '自分が出した申請は決裁できません');
    }

    await this.#updateStatus(
      id,
      current.status,
      `SET status = $3, decided_by = $4, decided_at = $5`,
      [next, deciderId, now],
    );
    return this.#requireById(id);
  }

  /** 状態ごとの件数。アプリトップの指標に使う。 */
  async countByStatus(status: RequestStatus): Promise<number> {
    const result = await this.#db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM requests WHERE status = $1`,
      [status],
    );
    return result.rows[0]?.n ?? 0;
  }

  #assertTransition(from: RequestStatus, to: RequestStatus): void {
    if (!canTransitionRequest(from, to)) {
      throw new ValidationError('status', `${from} から ${to} へは変更できません`);
    }
  }

  /**
   * 読んだときの状態を条件に入れて更新する。
   *
   * 状態の判定と更新は別の問い合わせなので、その間に他の決裁が入ると
   * 両方が遷移を通ってしまう。行が更新されなければ、間に誰かが動かした
   * ということなので、イベントを書く前に失敗させる。
   * `setClause` のプレースホルダは $3 から始めること。
   */
  async #updateStatus(
    id: string,
    expected: RequestStatus,
    setClause: string,
    params: unknown[],
  ): Promise<void> {
    const result = await this.#db.query(
      `UPDATE requests ${setClause} WHERE id = $1 AND status = $2`,
      [id, expected, ...params],
    );
    if (result.rowCount === 0) {
      throw new ValidationError('status', '別の操作で状態が変わりました。読み直してください');
    }
  }
}
