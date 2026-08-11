import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

let docClient: DynamoDBDocumentClient | undefined;

/** LocalStack に向いた DocumentClient。IT 全体で共有する。 */
export function getDocClient(): DynamoDBDocumentClient {
  docClient ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION,
      endpoint: process.env.LOCALSTACK_ENDPOINT,
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return docClient;
}

export function closeDocClient(): void {
  docClient?.destroy();
  docClient = undefined;
}

/** IT が対象にする events テーブル名。 */
export function eventsTableName(): string {
  return process.env.EVENTS_TABLE_NAME ?? 'events';
}

/**
 * テーブルの全アイテムを削除する。DynamoDB にはトランザクションによる
 * ロールバックが使えないため、beforeEach でこれを呼んで状態を揃える。
 *
 * ```ts
 * beforeEach(async () => {
 *   await clearDynamoTable();
 * });
 * ```
 */
export async function clearDynamoTable(tableName: string = eventsTableName()): Promise<void> {
  const client = getDocClient();
  let startKey: Record<string, unknown> | undefined;

  do {
    const scanned = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'userId, occurredAt',
        ExclusiveStartKey: startKey,
      }),
    );

    const items = scanned.Items ?? [];
    // BatchWrite は 1 リクエスト 25 件まで。
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await client.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((item) => ({
              DeleteRequest: {
                Key: { userId: item['userId'], occurredAt: item['occurredAt'] },
              },
            })),
          },
        }),
      );
    }

    startKey = scanned.LastEvaluatedKey;
  } while (startKey !== undefined);
}
