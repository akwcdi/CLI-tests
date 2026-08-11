import { hashPassword, type UserRow } from '@test/core';

import { getDb } from '../setup/db.ts';

let seq = 0;

/** ハッシュ化は 1 回あたり数十 ms かかるので、既定パスワードの分は使い回す。 */
export const DEFAULT_PASSWORD = 'password123';
let defaultHash: string | undefined;

async function resolveHash(password: string | undefined): Promise<string> {
  if (password !== undefined) {
    return hashPassword(password);
  }
  defaultHash ??= await hashPassword(DEFAULT_PASSWORD);
  return defaultHash;
}

/**
 * users に1行入れて、挿入された行をそのまま返す。
 *
 * 指定しなかったカラムは毎回ユニークな既定値で埋まる。
 * テストで意味を持つ値だけを渡すこと。
 *
 * `password` は UserRow に含まれない（password_hash を外に出さないため）が、
 * ログインを伴うテストのために平文で指定できる。省略時は
 * {@link DEFAULT_PASSWORD}。
 *
 * ```ts
 * const suspended = await insertUser({ status: 'suspended' });
 * const login = await insertUser({ password: 'my-secret-1' });
 * ```
 */
export async function insertUser(
  partial: Partial<UserRow> & { password?: string } = {},
): Promise<UserRow> {
  seq += 1;

  const email = partial.email ?? `user-${seq}-${Date.now()}@example.com`;
  const name = partial.name ?? `User ${seq}`;
  const status = partial.status ?? 'active';

  const result = await getDb().query<UserRow>(
    `INSERT INTO users (id, email, name, status, created_at, password_hash)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, COALESCE($5::timestamptz, now()), $6)
     RETURNING id, email, name, status, created_at`,
    [
      partial.id ?? null,
      email,
      name,
      status,
      partial.created_at ?? null,
      await resolveHash(partial.password),
    ],
  );

  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('insertUser: INSERT returned no row');
  }
  return row;
}
