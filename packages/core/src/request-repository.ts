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

/** 申請者名・決裁者名を添えて取得する共通の SELECT。 */
const SELECT_WITH_NAMES = `
  SELECT r.id, r.title, r.amount, r.status, r.requester_id, r.decided_by,
         r.created_at, r.decided_at,
         requester.name AS requester_name,
         decider.name   AS decider_name
    FROM requests r
    JOIN users requester ON requester.id = r.requester_id
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

  /** 下書きを承認へ回す。 */
  async submit(id: string): Promise<RequestWithNames> {
    const current = await this.#requireById(id);
    this.#assertTransition(current.status, 'pending');

    await this.#db.query(`UPDATE requests SET status = 'pending' WHERE id = $1`, [id]);
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

    await this.#db.query(
      `UPDATE requests SET status = $2, decided_by = $3, decided_at = $4 WHERE id = $1`,
      [id, next, deciderId, now],
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
}
