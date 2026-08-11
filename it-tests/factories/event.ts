import { PutCommand } from '@aws-sdk/lib-dynamodb';

import type { EventItem } from '@test/core';

import { eventsTableName, getDocClient } from '../setup/dynamo.ts';

let seq = 0;

/**
 * events テーブルに1アイテム入れて、書き込んだアイテムを返す。
 *
 * DynamoDB はロールバックできないので、使う側は beforeEach で
 * {@link import('../setup/dynamo.ts').clearDynamoTable} を呼ぶこと。
 *
 * ```ts
 * const e = await insertEvent({ userId: 'u1', type: 'signed_up' });
 * ```
 */
export async function insertEvent(partial: Partial<EventItem> = {}): Promise<EventItem> {
  seq += 1;

  const item: EventItem = {
    userId: partial.userId ?? `user-${seq}`,
    // ソートキーが衝突しないよう、連番をミリ秒に足す。
    occurredAt: partial.occurredAt ?? new Date(Date.now() + seq).toISOString(),
    type: partial.type ?? 'signed_up',
    payload: partial.payload ?? { seq },
  };

  await getDocClient().send(
    new PutCommand({
      TableName: eventsTableName(),
      Item: item,
    }),
  );

  return item;
}
