import type { UserRow } from '@test/core';

import { getDb } from '../setup/db.ts';

let seq = 0;

/**
 * users に1行入れて、挿入された行をそのまま返す。
 *
 * 指定しなかったカラムは毎回ユニークな既定値で埋まる。
 * テストで意味を持つ値だけを渡すこと。
 *
 * ```ts
 * const suspended = await insertUser({ status: 'suspended' });
 * ```
 */
export async function insertUser(partial: Partial<UserRow> = {}): Promise<UserRow> {
  seq += 1;

  const email = partial.email ?? `user-${seq}-${Date.now()}@example.com`;
  const name = partial.name ?? `User ${seq}`;
  const status = partial.status ?? 'active';

  const result = await getDb().query<UserRow>(
    `INSERT INTO users (id, email, name, status, created_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, COALESCE($5::timestamptz, now()))
     RETURNING id, email, name, status, created_at`,
    [partial.id ?? null, email, name, status, partial.created_at ?? null],
  );

  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('insertUser: INSERT returned no row');
  }
  return row;
}
