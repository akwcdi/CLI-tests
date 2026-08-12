/**
 * DB / AWS クライアントの接続初期化と依存の組み立てのみ。
 * このファイルは coverage.exclude の許可リストに含まれる。
 *
 * 分岐やドメインロジックを書かないこと。
 */
import {
  AuthRepository,
  config,
  createDynamoDocumentClient,
  createPool,
  EventStore,
  RequestRepository,
  UserRepository,
} from '@test/core';

import type { Deps } from './types.ts';

export function createDeps(): Deps {
  const pool = createPool();
  const docClient = createDynamoDocumentClient();

  return {
    users: new UserRepository(pool),
    auth: new AuthRepository(pool),
    events: new EventStore(docClient, config.eventsTableName),
    requests: new RequestRepository(pool),
  };
}
