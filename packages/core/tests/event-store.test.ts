import { describe, expect, it, vi } from 'vitest';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

import { decodeCursor, encodeCursor, InvalidCursorError } from '../src/cursor.ts';
import { EventStore } from '../src/event-store.ts';
import type { EventItem } from '../src/types.ts';

const TABLE = 'events';

/** send() をモックした DocumentClient。UT では LocalStack に接続しない。 */
function createClient() {
  const send = vi.fn();
  return { client: { send } as unknown as DynamoDBDocumentClient, send };
}

function makeEvent(overrides: Partial<EventItem> = {}): EventItem {
  return {
    userId: 'user-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    type: 'signed_up',
    payload: { plan: 'free' },
    ...overrides,
  };
}

/** 直近の send() に渡されたコマンドの input を取り出す。 */
function inputOf(send: ReturnType<typeof createClient>['send'], callIndex = 0): Record<string, unknown> {
  const command = send.mock.calls[callIndex]?.[0] as { input: Record<string, unknown> };
  return command.input;
}

describe('encodeCursor / decodeCursor', () => {
  it('往復して元のキーに戻る', () => {
    const key = { userId: 'user-1', occurredAt: '2026-01-01T00:00:00.000Z' };

    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it('base64url なので URL 安全な文字だけになる', () => {
    const cursor = encodeCursor({ userId: 'a'.repeat(40), occurredAt: '???' });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('JSON として壊れていれば null', () => {
    expect(decodeCursor('not-a-valid-cursor!!')).toBeNull();
  });

  it.each([
    ['配列', '[]'],
    ['null', 'null'],
    ['数値', '123'],
    ['文字列', '"abc"'],
  ])('オブジェクトでなければ null: %s', (_label, json) => {
    const cursor = Buffer.from(json, 'utf8').toString('base64url');

    expect(decodeCursor(cursor)).toBeNull();
  });
});

describe('InvalidCursorError', () => {
  it('name と message を保持する', () => {
    const error = new InvalidCursorError('xyz');

    expect(error.name).toBe('InvalidCursorError');
    expect(error.message).toBe('invalid cursor: xyz');
  });
});

describe('EventStore.append', () => {
  it('PutCommand で書き込み、渡したアイテムを返す', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({});
    const event = makeEvent();

    await expect(new EventStore(client, TABLE).append(event)).resolves.toBe(event);

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutCommand);
    expect(inputOf(send)).toEqual({ TableName: TABLE, Item: event });
  });
});

describe('EventStore.get', () => {
  it('見つかればアイテムを返す', async () => {
    const { client, send } = createClient();
    const event = makeEvent();
    send.mockResolvedValueOnce({ Item: event });

    await expect(
      new EventStore(client, TABLE).get('user-1', '2026-01-01T00:00:00.000Z'),
    ).resolves.toEqual(event);

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetCommand);
    expect(inputOf(send)['Key']).toEqual({
      userId: 'user-1',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('見つからなければ null', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({});

    await expect(new EventStore(client, TABLE).get('user-1', 'x')).resolves.toBeNull();
  });
});

describe('EventStore.listByUser', () => {
  it('既定では新しい順・limit=50・カーソル無しで Query する', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({ Items: [makeEvent()] });

    const page = await new EventStore(client, TABLE).listByUser('user-1');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(QueryCommand);
    expect(inputOf(send)).toMatchObject({
      TableName: TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': 'user-1' },
      ScanIndexForward: false,
      Limit: 50,
    });
    expect(inputOf(send)['ExclusiveStartKey']).toBeUndefined();
    expect(page.nextCursor).toBeNull();
  });

  it('ascending / limit を指定できる', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({ Items: [] });

    await new EventStore(client, TABLE).listByUser('user-1', { ascending: true, limit: 5 });

    expect(inputOf(send)).toMatchObject({ ScanIndexForward: true, Limit: 5 });
  });

  it('Items が無ければ空配列', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({});

    await expect(new EventStore(client, TABLE).listByUser('user-1')).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('LastEvaluatedKey があれば nextCursor を返す', async () => {
    const { client, send } = createClient();
    const lastKey = { userId: 'user-1', occurredAt: '2026-01-01T00:00:00.000Z' };
    send.mockResolvedValueOnce({ Items: [makeEvent()], LastEvaluatedKey: lastKey });

    const page = await new EventStore(client, TABLE).listByUser('user-1');

    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor as string)).toEqual(lastKey);
  });

  it('cursor を渡すと ExclusiveStartKey に復元する', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({ Items: [] });
    const key = { userId: 'user-1', occurredAt: '2026-01-01T00:00:00.000Z' };

    await new EventStore(client, TABLE).listByUser('user-1', { cursor: encodeCursor(key) });

    expect(inputOf(send)['ExclusiveStartKey']).toEqual(key);
  });

  it('cursor に null を渡した場合はカーソル無しとして扱う', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({ Items: [] });

    await new EventStore(client, TABLE).listByUser('user-1', { cursor: null });

    expect(inputOf(send)['ExclusiveStartKey']).toBeUndefined();
  });

  it('壊れた cursor は InvalidCursorError で、Query を投げない', async () => {
    const { client, send } = createClient();

    await expect(
      new EventStore(client, TABLE).listByUser('user-1', { cursor: 'broken!!' }),
    ).rejects.toThrow(InvalidCursorError);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('EventStore.remove', () => {
  it('削除できたら true', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({ Attributes: makeEvent() });

    await expect(new EventStore(client, TABLE).remove('user-1', 'x')).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteCommand);
    expect(inputOf(send)['ReturnValues']).toBe('ALL_OLD');
  });

  it('対象が無ければ false', async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce({});

    await expect(new EventStore(client, TABLE).remove('user-1', 'x')).resolves.toBe(false);
  });
});
