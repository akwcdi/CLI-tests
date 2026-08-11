/**
 * E2E の実行前に一度だけ走る下準備。
 *
 * Playwright の globalSetup ではなく手前の独立したステップにしてあるのは、
 * webServer（アプリ本体）が globalSetup より先に起動するため。
 * アプリが動き出したあとで DB を作り直すと、掴んでいる接続との競合になる。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';
import { Client } from 'pg';

import { hashPassword } from '@test/core';

import { E2E_ENV, E2E_USER } from './env.ts';

const exec = promisify(execFile);
const COMPOSE_FILE = '../../docker/docker-compose.yml';

async function resetDatabase(): Promise<void> {
  const admin = new Client({ connectionString: E2E_ENV.CID_ADMIN_DB_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${E2E_ENV.CID_TEST_DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${E2E_ENV.CID_TEST_DB_NAME}"`);
  } finally {
    await admin.end();
  }

  await exec('docker', [
    'compose',
    '-f',
    COMPOSE_FILE,
    'run',
    '--rm',
    '--no-deps',
    'flyway',
    `-url=jdbc:postgresql://postgres:5432/${E2E_ENV.CID_TEST_DB_NAME}`,
    '-user=user',
    '-password=pass',
    '-connectRetries=20',
    'migrate',
  ]);
}

async function resetDynamoTable(): Promise<void> {
  const client = new DynamoDBClient({
    region: E2E_ENV.AWS_REGION,
    endpoint: E2E_ENV.LOCALSTACK_ENDPOINT,
    credentials: {
      accessKeyId: E2E_ENV.AWS_ACCESS_KEY_ID,
      secretAccessKey: E2E_ENV.AWS_SECRET_ACCESS_KEY,
    },
  });
  const TableName = E2E_ENV.EVENTS_TABLE_NAME;

  try {
    try {
      await client.send(new DescribeTableCommand({ TableName }));
      await client.send(new DeleteTableCommand({ TableName }));
      await waitUntilTableNotExists({ client, maxWaitTime: 30 }, { TableName });
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) {
        throw error;
      }
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
  } finally {
    client.destroy();
  }
}

/** ログインに使う管理ユーザーと、一覧・ページングの見栄え用のデータを入れる。 */
async function seed(): Promise<void> {
  const db = new Client({ connectionString: E2E_ENV.CID_DB_URL });
  await db.connect();
  try {
    const adminHash = await hashPassword(E2E_USER.password);
    await db.query(
      `INSERT INTO users (email, name, status, password_hash, created_at)
       VALUES ($1, $2, 'active', $3, now())`,
      [E2E_USER.email, E2E_USER.name, adminHash],
    );

    // ページングを確認できるだけの件数を、順序が決まるように入れる。
    const filler = await hashPassword('password123');
    for (let i = 1; i <= 7; i += 1) {
      await db.query(
        `INSERT INTO users (email, name, status, password_hash, created_at)
         VALUES ($1, $2, $3, $4, now() - ($5 || ' minutes')::interval)`,
        [
          `member${i}@example.com`,
          `Member ${i}`,
          i % 3 === 0 ? 'suspended' : 'active',
          filler,
          String(i),
        ],
      );
    }
  } finally {
    await db.end();
  }
}

const startedAt = Date.now();
try {
  await resetDatabase();
  await resetDynamoTable();
  await seed();
  console.log(`[e2e] prepared in ${Date.now() - startedAt}ms`);
} catch (error) {
  console.error(
    'E2E の下準備に失敗しました。Docker が起動しているか確認してください（pnpm docker:up）。',
  );
  throw error;
}
