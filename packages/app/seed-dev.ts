/**
 * 開発用 DB（`db`）に、手元で触るためのデータを入れる。
 *
 * 何度実行しても同じ状態になる（既にあれば何もしない）。
 * テスト用の DB（db_test / db_e2e）には触らない。
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { Client } from 'pg';

import { config, hashPassword } from '@test/core';

const ADMIN = { email: 'admin@example.com', password: 'password123', name: '管理者' };

/** events テーブルが無ければ作る。無いとユーザー作成が 500 になる。 */
async function ensureEventsTable(): Promise<void> {
  const client = new DynamoDBClient({
    region: config.awsRegion,
    endpoint: config.localstackEndpoint,
  });
  const TableName = config.eventsTableName;
  try {
    await client.send(new DescribeTableCommand({ TableName }));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }
    await client.send(
      new CreateTableCommand({
        TableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'occurredAt', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' },
          { AttributeName: 'occurredAt', KeyType: 'RANGE' },
        ],
      }),
    );
    await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName });
    console.log(`DynamoDB テーブル ${TableName} を作成しました。`);
  } finally {
    client.destroy();
  }
}

await ensureEventsTable();

const db = new Client({ connectionString: config.databaseUrl });
await db.connect();

try {
  const existing = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if ((existing.rows[0]?.n ?? 0) > 0) {
    console.log('既にデータがあるので何もしません。');
    console.log(`ログイン: ${ADMIN.email} / ${ADMIN.password}`);
  } else {
    await db.query(
      `INSERT INTO users (email, name, status, password_hash)
       VALUES ($1, $2, 'active', $3)`,
      [ADMIN.email, ADMIN.name, await hashPassword(ADMIN.password)],
    );

    // 一覧とページングを触れるだけの件数を入れる。
    const filler = await hashPassword('password123');
    for (let i = 1; i <= 7; i += 1) {
      await db.query(
        `INSERT INTO users (email, name, status, password_hash, created_at)
         VALUES ($1, $2, $3, $4, now() - ($5 || ' minutes')::interval)`,
        [
          `member${i}@example.com`,
          `メンバー ${i}`,
          i % 3 === 0 ? 'suspended' : 'active',
          filler,
          String(i),
        ],
      );
    }
    console.log('シードしました。');
    console.log(`ログイン: ${ADMIN.email} / ${ADMIN.password}`);
  }
} catch (error) {
  console.error(
    'シードに失敗しました。`pnpm docker:up` でコンテナが起動しているか確認してください。',
  );
  throw error;
} finally {
  await db.end();
}
