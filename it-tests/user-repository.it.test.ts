import { describe, expect, it } from 'vitest';

import { InvalidCursorError, UserNotFoundError, UserRepository, ValidationError } from '@test/core';

import { insertUser } from './factories/user.ts';
import { getPool, useTransaction } from './setup/db.ts';

describe('UserRepository (PostgreSQL)', () => {
  // 各テストは BEGIN 〜 ROLLBACK で囲まれるので、書き込みは次のテストに残らない。
  const tx = useTransaction(getPool());

  const repo = () => new UserRepository(tx());

  describe('create', () => {
    it('実際に行が保存され、読み戻せる', async () => {
      const created = await repo().create({ email: 'Alice@Example.com', name: ' Alice ', password: 'password123' });

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.email).toBe('alice@example.com');
      expect(created.name).toBe('Alice');
      expect(created.status).toBe('active');
      expect(created.created_at).toBeInstanceOf(Date);

      const found = await repo().findById(created.id);
      expect(found).toEqual(created);
    });

    it('登録済みのメールは ValidationError（DB の UNIQUE 制約より手前で弾く）', async () => {
      await insertUser({ email: 'dup@example.com' });

      await expect(repo().create({ email: 'DUP@example.com', name: 'Bob', password: 'password123' })).rejects.toThrow(
        ValidationError,
      );
    });
  });

  describe('トランザクション分離', () => {
    it('このテストでユーザーを1件作る', async () => {
      await insertUser({ email: 'leak-check@example.com' });

      await expect(repo().findByEmail('leak-check@example.com')).resolves.not.toBeNull();
    });

    it('前のテストの書き込みは ROLLBACK されて残っていない', async () => {
      await expect(repo().findByEmail('leak-check@example.com')).resolves.toBeNull();
    });
  });

  describe('list', () => {
    it('created_at の降順に並び、カーソルで次ページを取れる', async () => {
      const older = await insertUser({ created_at: new Date('2026-01-01T00:00:00.000Z') });
      const middle = await insertUser({ created_at: new Date('2026-02-01T00:00:00.000Z') });
      const newer = await insertUser({ created_at: new Date('2026-03-01T00:00:00.000Z') });

      const first = await repo().list({ limit: 2 });
      expect(first.items.map((u) => u.id)).toEqual([newer.id, middle.id]);
      expect(first.nextCursor).not.toBeNull();

      const second = await repo().list({ limit: 2, cursor: first.nextCursor });
      expect(second.items.map((u) => u.id)).toEqual([older.id]);
      expect(second.nextCursor).toBeNull();
    });

    it('created_at が同一の行がページ境界を跨いでも取りこぼさない', async () => {
      // created_at だけをカーソルにすると、同時刻の行が strict 比較で
      // 丸ごと飛ばされて消える。実際に 3 件中 1 件が失われていた。
      const sameMoment = new Date('2026-05-05T00:00:00.000Z');
      const created = await Promise.all([
        insertUser({ created_at: sameMoment }),
        insertUser({ created_at: sameMoment }),
        insertUser({ created_at: sameMoment }),
      ]);

      const first = await repo().list({ limit: 2 });
      const second = await repo().list({ limit: 2, cursor: first.nextCursor });
      const seen = [...first.items, ...second.items].map((u) => u.id);

      expect(new Set(seen)).toEqual(new Set(created.map((u) => u.id)));
      expect(seen).toHaveLength(3);
    });

    it('壊れたカーソルは InvalidCursorError', async () => {
      await expect(repo().list({ cursor: 'broken!!' })).rejects.toThrow(InvalidCursorError);
    });

    it('1件も無ければ空ページ', async () => {
      await expect(repo().list()).resolves.toEqual({ items: [], nextCursor: null });
    });
  });

  describe('updateStatus', () => {
    it('ステータスを更新して永続化する', async () => {
      const user = await insertUser({ status: 'active' });

      const updated = await repo().updateStatus(user.id, 'suspended');
      expect(updated.status).toBe('suspended');

      const reloaded = await repo().findById(user.id);
      expect(reloaded?.status).toBe('suspended');
    });

    it('存在しない id なら UserNotFoundError', async () => {
      await expect(
        repo().updateStatus('00000000-0000-4000-8000-000000000000', 'suspended'),
      ).rejects.toThrow(UserNotFoundError);
    });

    it('同じステータスへの更新は ValidationError', async () => {
      const user = await insertUser({ status: 'active' });

      await expect(repo().updateStatus(user.id, 'active')).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteById', () => {
    it('削除できたら true を返し、行が消える', async () => {
      const user = await insertUser();

      await expect(repo().deleteById(user.id)).resolves.toBe(true);
      await expect(repo().findById(user.id)).resolves.toBeNull();
    });

    it('存在しない id なら false', async () => {
      await expect(
        repo().deleteById('00000000-0000-4000-8000-000000000000'),
      ).resolves.toBe(false);
    });
  });

  describe('スキーマ制約', () => {
    it('status に許可外の値は CHECK 制約で拒否される', async () => {
      await expect(
        insertUser({ status: 'unknown' as 'active' }),
      ).rejects.toThrow(/users_status_check/);
    });
  });
});
