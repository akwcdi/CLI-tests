import { beforeEach, describe, expect, it } from 'vitest';

import { EventStore, InvalidCursorError } from '@test/core';

import { insertEvent } from './factories/event.ts';
import { clearDynamoTable, eventsTableName, getDocClient } from './setup/dynamo.ts';

describe('EventStore (LocalStack DynamoDB)', () => {
  // DynamoDB はロールバックできないので、毎テスト前に全件消す。
  beforeEach(async () => {
    await clearDynamoTable();
  });

  const store = () => new EventStore(getDocClient(), eventsTableName());

  describe('append / get', () => {
    it('書き込んだアイテムをキーで読み戻せる', async () => {
      const event = await store().append({
        userId: 'user-1',
        occurredAt: '2026-01-01T00:00:00.000Z',
        type: 'signed_up',
        payload: { plan: 'pro', trial: false },
      });

      const found = await store().get(event.userId, event.occurredAt);
      expect(found).toEqual(event);
    });

    it('存在しないキーなら null', async () => {
      await expect(store().get('missing', '2026-01-01T00:00:00.000Z')).resolves.toBeNull();
    });

    it('同じキーへの append は上書きになる', async () => {
      const key = { userId: 'user-1', occurredAt: '2026-01-01T00:00:00.000Z' };
      await store().append({ ...key, type: 'first', payload: {} });
      await store().append({ ...key, type: 'second', payload: {} });

      const found = await store().get(key.userId, key.occurredAt);
      expect(found?.type).toBe('second');
    });
  });

  describe('clearDynamoTable', () => {
    it('前のテストで入れたアイテムは残っていない', async () => {
      const page = await store().listByUser('user-1');

      expect(page.items).toEqual([]);
    });
  });

  describe('listByUser', () => {
    beforeEach(async () => {
      await insertEvent({ userId: 'u1', occurredAt: '2026-01-01T00:00:00.000Z', type: 'a' });
      await insertEvent({ userId: 'u1', occurredAt: '2026-02-01T00:00:00.000Z', type: 'b' });
      await insertEvent({ userId: 'u1', occurredAt: '2026-03-01T00:00:00.000Z', type: 'c' });
      // 別ユーザーのイベントは混ざらないこと。
      await insertEvent({ userId: 'u2', occurredAt: '2026-01-15T00:00:00.000Z', type: 'z' });
    });

    it('既定では新しい順に、指定ユーザーの分だけ返す', async () => {
      const page = await store().listByUser('u1');

      expect(page.items.map((e) => e.type)).toEqual(['c', 'b', 'a']);
      expect(page.nextCursor).toBeNull();
    });

    it('ascending:true なら古い順', async () => {
      const page = await store().listByUser('u1', { ascending: true });

      expect(page.items.map((e) => e.type)).toEqual(['a', 'b', 'c']);
    });

    it('limit とカーソルでページングできる', async () => {
      const first = await store().listByUser('u1', { limit: 2 });
      expect(first.items.map((e) => e.type)).toEqual(['c', 'b']);
      expect(first.nextCursor).not.toBeNull();

      const second = await store().listByUser('u1', { limit: 2, cursor: first.nextCursor });
      expect(second.items.map((e) => e.type)).toEqual(['a']);
      expect(second.nextCursor).toBeNull();
    });

    it('壊れたカーソルは InvalidCursorError', async () => {
      await expect(store().listByUser('u1', { cursor: 'broken!!' })).rejects.toThrow(
        InvalidCursorError,
      );
    });

    it('イベントが無いユーザーは空ページ', async () => {
      await expect(store().listByUser('unknown')).resolves.toEqual({
        items: [],
        nextCursor: null,
      });
    });
  });

  describe('remove', () => {
    it('削除できたら true を返し、読み戻せなくなる', async () => {
      const event = await insertEvent({ userId: 'u1' });

      await expect(store().remove(event.userId, event.occurredAt)).resolves.toBe(true);
      await expect(store().get(event.userId, event.occurredAt)).resolves.toBeNull();
    });

    it('存在しないキーなら false', async () => {
      await expect(store().remove('u1', '2026-01-01T00:00:00.000Z')).resolves.toBe(false);
    });
  });
});
