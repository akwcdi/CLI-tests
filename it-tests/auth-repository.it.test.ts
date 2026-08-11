import { describe, expect, it } from 'vitest';

import { AuthRepository, verifyPassword } from '@test/core';

import { insertSession } from './factories/session.ts';
import { DEFAULT_PASSWORD, insertUser } from './factories/user.ts';
import { getPool, useTransaction } from './setup/db.ts';

describe('AuthRepository (PostgreSQL)', () => {
  const tx = useTransaction(getPool());

  const repo = () => new AuthRepository(tx());

  describe('findCredentialsByEmail', () => {
    it('保存された password_hash が実際に照合できる', async () => {
      const user = await insertUser({ email: 'login@example.com' });

      const credentials = await repo().findCredentialsByEmail('LOGIN@example.com');

      expect(credentials?.id).toBe(user.id);
      await expect(verifyPassword(DEFAULT_PASSWORD, credentials?.password_hash ?? '')).resolves.toBe(
        true,
      );
      await expect(verifyPassword('wrong', credentials?.password_hash ?? '')).resolves.toBe(false);
    });

    it('未登録のメールなら null', async () => {
      await expect(repo().findCredentialsByEmail('nobody@example.com')).resolves.toBeNull();
    });
  });

  describe('createSession / findUserBySession', () => {
    it('発行したセッションでユーザーを引ける', async () => {
      const user = await insertUser();

      const session = await repo().createSession(user.id);
      const found = await repo().findUserBySession(session.token);

      expect(found?.id).toBe(user.id);
      // password_hash が UserRow に混ざっていないこと。
      expect(found).not.toHaveProperty('password_hash');
    });

    it('期限切れのセッションでは引けない', async () => {
      const user = await insertUser();
      const session = await insertSession({
        user_id: user.id,
        expires_at: new Date('2020-01-01T00:00:00.000Z'),
      });

      await expect(repo().findUserBySession(session.token)).resolves.toBeNull();
    });

    it('未知のトークンなら null', async () => {
      await expect(repo().findUserBySession('no-such-token')).resolves.toBeNull();
    });

    it('ユーザーを削除するとセッションも消える（ON DELETE CASCADE）', async () => {
      const user = await insertUser();
      const session = await repo().createSession(user.id);

      await tx().query('DELETE FROM users WHERE id = $1', [user.id]);

      await expect(repo().findUserBySession(session.token)).resolves.toBeNull();
      const remaining = await tx().query('SELECT token FROM sessions WHERE token = $1', [
        session.token,
      ]);
      expect(remaining.rows).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('削除できたら true を返し、以後引けなくなる', async () => {
      const user = await insertUser();
      const session = await repo().createSession(user.id);

      await expect(repo().deleteSession(session.token)).resolves.toBe(true);
      await expect(repo().findUserBySession(session.token)).resolves.toBeNull();
    });

    it('存在しないトークンなら false', async () => {
      await expect(repo().deleteSession('no-such-token')).resolves.toBe(false);
    });
  });
});
