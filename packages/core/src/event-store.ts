import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

import type { EventItem, Page } from './types.ts';

const DEFAULT_LIMIT = 50;

type DynamoKey = Record<string, unknown>;

/** LastEvaluatedKey を不透明なカーソル文字列に変換する。 */
export function encodeCursor(key: DynamoKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

/** カーソル文字列を LastEvaluatedKey に戻す。壊れている場合は null。 */
export function decodeCursor(cursor: string): DynamoKey | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as DynamoKey;
  } catch {
    return null;
  }
}

/** カーソルが不正なときに投げられる。 */
export class InvalidCursorError extends Error {
  constructor(cursor: string) {
    super(`invalid cursor: ${cursor}`);
    this.name = 'InvalidCursorError';
  }
}

export class EventStore {
  readonly #client: DynamoDBDocumentClient;
  readonly #tableName: string;

  constructor(client: DynamoDBDocumentClient, tableName: string) {
    this.#client = client;
    this.#tableName = tableName;
  }

  /** イベントを1件書き込む。書き込んだアイテムをそのまま返す。 */
  async append(event: EventItem): Promise<EventItem> {
    await this.#client.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: event,
      }),
    );
    return event;
  }

  async get(userId: string, occurredAt: string): Promise<EventItem | null> {
    const response = await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { userId, occurredAt },
      }),
    );
    return (response.Item as EventItem | undefined) ?? null;
  }

  /**
   * 指定ユーザーのイベントを occurredAt 順に取得する。
   * `ascending` 省略時は新しい順。
   */
  async listByUser(
    userId: string,
    options: { limit?: number; cursor?: string | null; ascending?: boolean } = {},
  ): Promise<Page<EventItem>> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const cursor = options.cursor ?? null;

    let exclusiveStartKey: DynamoKey | undefined;
    if (cursor !== null) {
      const decoded = decodeCursor(cursor);
      if (decoded === null) {
        throw new InvalidCursorError(cursor);
      }
      exclusiveStartKey = decoded;
    }

    const response = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        ScanIndexForward: options.ascending ?? false,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const lastKey = response.LastEvaluatedKey as DynamoKey | undefined;
    return {
      items: (response.Items as EventItem[] | undefined) ?? [],
      nextCursor: lastKey === undefined ? null : encodeCursor(lastKey),
    };
  }

  /** イベントを1件削除する。存在しなかった場合は false。 */
  async remove(userId: string, occurredAt: string): Promise<boolean> {
    const response = await this.#client.send(
      new DeleteCommand({
        TableName: this.#tableName,
        Key: { userId, occurredAt },
        ReturnValues: 'ALL_OLD',
      }),
    );
    return response.Attributes !== undefined;
  }
}
