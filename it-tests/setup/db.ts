import { afterEach, beforeEach } from 'vitest';
import { Pool, type PoolClient } from 'pg';

import type { Queryable } from '@test/core';

let pool: Pool | undefined;

/** IT 全体で共有する接続プール。最初の呼び出しで作られる。 */
export function getPool(): Pool {
  pool ??= new Pool({
    connectionString: process.env.CID_DB_URL,
    max: 5,
  });
  return pool;
}

/** テストファイル終了時にプールを閉じる（it-tests/setup/setup-file.ts から呼ばれる）。 */
export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * useTransaction が張っている最中のトランザクション用クライアント。
 * ファクトリはここを経由して同じトランザクションに書き込む。
 */
let activeClient: PoolClient | undefined;

/**
 * 現在の実行文脈で使うべき接続を返す。
 * トランザクション中ならその Client、そうでなければ Pool。
 */
export function getDb(): Queryable {
  return activeClient ?? getPool();
}

/**
 * 各テストをトランザクションで囲み、テスト後に必ず ROLLBACK する。
 *
 * describe の直下で呼び出し、返り値のアクセサでクライアントを取得する。
 *
 * ```ts
 * describe('UserRepository', () => {
 *   const tx = useTransaction(getPool());
 *   it('...', async () => {
 *     const repo = new UserRepository(tx());
 *   });
 * });
 * ```
 *
 * 注意: テスト対象のコード側で COMMIT / 別コネクションを掴むと
 * ロールバックが効かない。その場合は明示的に後始末すること。
 */
export function useTransaction(targetPool: Pool = getPool()): () => PoolClient {
  let client: PoolClient | undefined;

  beforeEach(async () => {
    client = await targetPool.connect();
    await client.query('BEGIN');
    activeClient = client;
  });

  afterEach(async () => {
    activeClient = undefined;
    if (client === undefined) {
      return;
    }
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
      client = undefined;
    }
  });

  return () => {
    if (client === undefined) {
      throw new Error(
        'useTransaction(): トランザクションが開始されていません。describe 直下で呼び、テスト本体の中でアクセサを使ってください。',
      );
    }
    return client;
  };
}
