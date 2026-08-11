import type { RequestRow } from '@test/core';

import { getDb } from '../setup/db.ts';

let seq = 0;

/**
 * requests に1行入れて、挿入された行をそのまま返す。
 *
 * `requester_id` は必須。呼ぶ側で先に
 * {@link import('./user.ts').insertUser} を実行すること。
 *
 * ```ts
 * const pending = await insertRequest({ requester_id: user.id, status: 'pending' });
 * ```
 */
export async function insertRequest(
  partial: Partial<RequestRow> & { requester_id: string },
): Promise<RequestRow> {
  seq += 1;

  const result = await getDb().query<RequestRow>(
    `INSERT INTO requests (id, title, amount, status, requester_id, decided_by, created_at, decided_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::uuid,
             COALESCE($7::timestamptz, now()), $8::timestamptz)
     RETURNING id, title, amount, status, requester_id, decided_by, created_at, decided_at`,
    [
      partial.id ?? null,
      partial.title ?? `申請 ${seq}`,
      partial.amount ?? 1000 * seq,
      partial.status ?? 'draft',
      partial.requester_id,
      partial.decided_by ?? null,
      partial.created_at ?? null,
      partial.decided_at ?? null,
    ],
  );

  const row = result.rows[0];
  if (row === undefined) {
    throw new Error('insertRequest: INSERT returned no row');
  }
  return row;
}
