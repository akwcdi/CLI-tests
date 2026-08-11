import { createSessionToken, sessionExpiresAt, type SessionRow } from '@test/core';

import { getDb } from '../setup/db.ts';

/**
 * sessions に1行入れて、挿入された行をそのまま返す。
 *
 * `user_id` は必須。呼ぶ側で {@link import('./user.ts').insertUser} を先に実行すること。
 * 期限切れの検証をしたい場合は `expires_at` に過去日を渡す。
 *
 * ```ts
 * const expired = await insertSession({ user_id: user.id, expires_at: new Date(0) });
 * ```
 */
export async function insertSession(
  partial: Partial<SessionRow> & { user_id: string },
): Promise<SessionRow> {
  const result = await getDb().query<SessionRow>(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, $3)
     RETURNING token, user_id, created_at, expires_at`,
    [partial.token ?? createSessionToken(), partial.user_id, partial.expires_at ?? sessionExpiresAt()],
  );

  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('insertSession: INSERT returned no row');
  }
  return row;
}
