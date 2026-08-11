import { createSessionToken, sessionExpiresAt } from './session.ts';
import type { SessionRow, UserCredentials, UserRow } from './types.ts';
import type { Queryable } from './user-repository.ts';
import { normalizeEmail } from './user.ts';

/**
 * ログイン照合とセッションの永続化。
 *
 * セッションを DB に置いているのは、ログアウトや利用停止で
 * 即座に無効化できるようにするため。
 */
export class AuthRepository {
  readonly #db: Queryable;

  constructor(db: Queryable) {
    this.#db = db;
  }

  /** 照合用に password_hash を引く。UserRow には含めない。 */
  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const result = await this.#db.query<UserCredentials>(
      `SELECT id, password_hash FROM users WHERE email = $1`,
      [normalizeEmail(email)],
    );
    return result.rows[0] ?? null;
  }

  /** セッションを発行する。トークンと期限はここで決める。 */
  async createSession(userId: string, now: Date = new Date()): Promise<SessionRow> {
    const result = await this.#db.query<SessionRow>(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING token, user_id, created_at, expires_at`,
      [createSessionToken(), userId, sessionExpiresAt(now)],
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT returned no session row');
    }
    return row;
  }

  /**
   * 有効なセッションに紐づくユーザーを返す。
   * トークンが無い / 期限切れ / ユーザーが消えている場合は null。
   */
  async findUserBySession(token: string, now: Date = new Date()): Promise<UserRow | null> {
    const result = await this.#db.query<UserRow>(
      `SELECT u.id, u.email, u.name, u.status, u.created_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > $2`,
      [token, now],
    );
    return result.rows[0] ?? null;
  }

  /** ログアウト。削除できたら true。 */
  async deleteSession(token: string): Promise<boolean> {
    const result = await this.#db.query(`DELETE FROM sessions WHERE token = $1`, [token]);
    return (result.rowCount ?? 0) > 0;
  }
}
