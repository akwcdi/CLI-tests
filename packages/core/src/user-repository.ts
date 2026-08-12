import { decodeCursor, encodeCursor, InvalidCursorError } from './cursor.ts';
import { hashPassword } from './password.ts';
import type { Page, NewUser, UserRow, UserStatus } from './types.ts';
import { canTransition, normalizeEmail, validateNewUser, ValidationError } from './user.ts';

/**
 * `pg` の Pool / PoolClient / トランザクション中の Client のいずれも受け取れる
 * 最小インターフェース。IT では実接続を、UT ではモックを渡す。
 */
export interface Queryable {
  query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

/** 対象の行が見つからなかったときに投げられる。 */
export class UserNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`user not found: ${id}`);
    this.name = 'UserNotFoundError';
    this.id = id;
  }
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** 一覧カーソルの中身。ORDER BY と同じ組を持つ。 */
interface UserCursor {
  created_at: string;
  id: string;
}

/** カーソル文字列を検証して復元する。壊れていれば InvalidCursorError。 */
function parseUserCursor(cursor: string): UserCursor {
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

export class UserRepository {
  readonly #db: Queryable;

  constructor(db: Queryable) {
    this.#db = db;
  }

  /** ユーザーを1件作成する。メールが既存の場合は ValidationError を投げる。 */
  async create(input: NewUser): Promise<UserRow> {
    const valid = validateNewUser(input);

    const existing = await this.findByEmail(valid.email);
    if (existing !== null) {
      throw new ValidationError('email', `email already registered: ${valid.email}`);
    }

    const result = await this.#db.query<UserRow>(
      `INSERT INTO users (email, name, status, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, status, created_at`,
      [valid.email, valid.name, valid.status, await hashPassword(valid.password)],
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT returned no row');
    }
    return row;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.#db.query<UserRow>(
      `SELECT id, email, name, status, created_at FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.#db.query<UserRow>(
      `SELECT id, email, name, status, created_at FROM users WHERE email = $1`,
      [normalizeEmail(email)],
    );
    return result.rows[0] ?? null;
  }

  /**
   * created_at の降順で一覧を返す。`cursor` には前ページの nextCursor を渡す。
   * limit は 1..{@link MAX_LIMIT} に丸められる。
   *
   * カーソルは `(created_at, id)` の複合。created_at だけで絞ると、
   * 同時刻の行がページ境界を跨いだときに取りこぼす。
   * ORDER BY と同じ組で行値比較すること。
   */
  async list(options: { limit?: number; cursor?: string | null } = {}): Promise<Page<UserRow>> {
    const requested = options.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(Math.max(requested, 1), MAX_LIMIT);
    const cursor = options.cursor ?? null;
    const key = cursor === null ? null : parseUserCursor(cursor);

    // limit+1 件取得して、次ページの有無を判定する。
    const result =
      key === null
        ? await this.#db.query<UserRow>(
            `SELECT id, email, name, status, created_at FROM users
             ORDER BY created_at DESC, id DESC
             LIMIT $1`,
            [limit + 1],
          )
        : await this.#db.query<UserRow>(
            `SELECT id, email, name, status, created_at FROM users
             WHERE (created_at, id) < ($1::timestamptz, $2::uuid)
             ORDER BY created_at DESC, id DESC
             LIMIT $3`,
            [key.created_at, key.id, limit + 1],
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

  /** ステータスを更新する。同一ステータスへの更新は ValidationError。 */
  async updateStatus(id: string, next: UserStatus): Promise<UserRow> {
    const current = await this.findById(id);
    if (current === null) {
      throw new UserNotFoundError(id);
    }
    if (!canTransition(current.status, next)) {
      throw new ValidationError('status', `already ${next}`);
    }

    const result = await this.#db.query<UserRow>(
      `UPDATE users SET status = $2 WHERE id = $1
       RETURNING id, email, name, status, created_at`,
      [id, next],
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new UserNotFoundError(id);
    }
    return row;
  }

  /** 総件数。アプリトップの指標に使う。 */
  async countAll(): Promise<number> {
    const result = await this.#db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
    return result.rows[0]?.n ?? 0;
  }

  /** 削除できたら true、対象が無ければ false。 */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.#db.query(`DELETE FROM users WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
