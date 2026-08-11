import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'pg';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';

const exec = promisify(execFile);

const ADMIN_DB_URL = process.env.CID_ADMIN_DB_URL ?? 'postgres://user:pass@localhost:5432/postgres';
const TEST_DB_NAME = process.env.CID_TEST_DB_NAME ?? 'db_test';
const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const EVENTS_TABLE = process.env.EVENTS_TABLE_NAME ?? 'events';

const COMPOSE_FILE = 'docker/docker-compose.yml';

/**
 * テスト用 DB を DROP → CREATE し、Flyway でマイグレーションを流す。
 */
async function resetDatabase(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  try {
    // 接続が残っていても落とせるように FORCE を付ける。
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await admin.end();
  }

  // compose ネットワーク内から postgres サービスへ接続してマイグレーションする。
  await exec('docker', [
    'compose',
    '-f',
    COMPOSE_FILE,
    'run',
    '--rm',
    '--no-deps',
    'flyway',
    `-url=jdbc:postgresql://postgres:5432/${TEST_DB_NAME}`,
    '-user=user',
    '-password=pass',
    '-connectRetries=20',
    'migrate',
  ]);
}

/**
 * DynamoDB テーブルを DROP → CREATE する。
 */
async function resetDynamoTable(): Promise<void> {
  const client = new DynamoDBClient({
    region: AWS_REGION,
    endpoint: LOCALSTACK_ENDPOINT,
  });

  try {
    try {
      await client.send(new DescribeTableCommand({ TableName: EVENTS_TABLE }));
      await client.send(new DeleteTableCommand({ TableName: EVENTS_TABLE }));
      await waitUntilTableNotExists(
        { client, maxWaitTime: 30 },
        { TableName: EVENTS_TABLE },
      );
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) {
        throw error;
      }
      // まだ作られていないだけなので、そのまま CREATE に進む。
    }

    await client.send(
      new CreateTableCommand({
        TableName: EVENTS_TABLE,
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

    await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: EVENTS_TABLE });
  } finally {
    client.destroy();
  }
}

export async function setup(): Promise<void> {
  const startedAt = Date.now();
  try {
    await Promise.all([resetDatabase(), resetDynamoTable()]);
  } catch (error) {
    throw new Error(
      `IT の初期化に失敗しました。Docker が起動しているか確認してください（pnpm docker:up）。\n${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  console.log(`[it] setup done in ${Date.now() - startedAt}ms`);
}

export async function teardown(): Promise<void> {
  // コンテナは起動したままにする。落としたいときは `pnpm docker:down`。
  // 失敗調査のためテストデータもそのまま残す。
}
