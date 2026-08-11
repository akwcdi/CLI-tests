/**
 * DB / AWS クライアントの接続初期化のみ。
 * このファイルは coverage.exclude の許可リストに含まれる。
 *
 * ここには分岐やドメインロジックを書かないこと。書きたくなったら
 * それはテスト対象なので別ファイルに出す。認証情報やエンドポイントの
 * 出し分けは環境変数側（vitest.config.it.ts / 実行環境）で吸収する。
 */
import { Pool } from 'pg';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { config } from './config.ts';

export function createPool(connectionString: string = config.databaseUrl): Pool {
  return new Pool({ connectionString });
}

export function createDynamoDocumentClient(
  endpoint: string | undefined = config.localstackEndpoint,
): DynamoDBDocumentClient {
  const client = new DynamoDBClient({ region: config.awsRegion, endpoint });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
