import { describe, expect, it } from 'vitest';

import { RequestNotFoundError, RequestRepository, ValidationError } from '@test/core';

import { insertRequest } from './factories/request.ts';
import { insertUser } from './factories/user.ts';
import { getPool, useTransaction } from './setup/db.ts';

describe('RequestRepository (PostgreSQL)', () => {
  const tx = useTransaction(getPool());

  const repo = () => new RequestRepository(tx());

  describe('create', () => {
    it('draft として保存され、申請者名が添えて返る', async () => {
      const requester = await insertUser({ name: '田中 太郎' });

      const created = await repo().create({
        title: ' 備品購入 ',
        amount: 12000,
        requesterId: requester.id,
      });

      expect(created.title).toBe('備品購入');
      expect(created.status).toBe('draft');
      expect(created.requester_name).toBe('田中 太郎');
      expect(created.decided_at).toBeNull();
      expect(created.decider_name).toBeNull();
    });

    it('金額 0 は CHECK 制約より手前で ValidationError', async () => {
      const requester = await insertUser();

      await expect(
        repo().create({ title: 'x', amount: 0, requesterId: requester.id }),
      ).rejects.toThrow(ValidationError);
    });

    it('存在しない申請者は外部キー違反になる', async () => {
      await expect(
        repo().create({
          title: 'x',
          amount: 100,
          requesterId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toThrow(/requests_requester_id_fkey/);
    });
  });

  describe('list', () => {
    it('status で絞り込める', async () => {
      const requester = await insertUser();
      await insertRequest({ requester_id: requester.id, status: 'draft' });
      const pending = await insertRequest({ requester_id: requester.id, status: 'pending' });

      const page = await repo().list({ status: 'pending' });

      expect(page.items.map((r) => r.id)).toEqual([pending.id]);
    });

    it('created_at が同一でもページ境界で取りこぼさない', async () => {
      const requester = await insertUser();
      const at = new Date('2026-06-06T00:00:00.000Z');
      const created = await Promise.all([
        insertRequest({ requester_id: requester.id, created_at: at }),
        insertRequest({ requester_id: requester.id, created_at: at }),
        insertRequest({ requester_id: requester.id, created_at: at }),
      ]);

      const first = await repo().list({ limit: 2 });
      const second = await repo().list({ limit: 2, cursor: first.nextCursor });
      const seen = [...first.items, ...second.items].map((r) => r.id);

      expect(new Set(seen)).toEqual(new Set(created.map((r) => r.id)));
    });
  });

  describe('submit と decide', () => {
    it('draft → pending → approved まで進み、決裁者名が入る', async () => {
      const requester = await insertUser({ name: '申請 太郎' });
      const decider = await insertUser({ name: '決裁 花子' });
      const draft = await insertRequest({ requester_id: requester.id, status: 'draft' });

      const submitted = await repo().submit(draft.id, requester.id);
      expect(submitted.status).toBe('pending');

      const approved = await repo().decide(draft.id, 'approved', decider.id);
      expect(approved.status).toBe('approved');
      expect(approved.decider_name).toBe('決裁 花子');
      expect(approved.decided_at).toBeInstanceOf(Date);
    });

    it('自分が出した申請は決裁できない', async () => {
      const requester = await insertUser();
      const pending = await insertRequest({ requester_id: requester.id, status: 'pending' });

      await expect(repo().decide(pending.id, 'approved', requester.id)).rejects.toThrow(
        ValidationError,
      );

      // 状態も変わっていないこと。
      const reloaded = await repo().findById(pending.id);
      expect(reloaded?.status).toBe('pending');
    });

    it('決裁済みは終端で、もう動かせない', async () => {
      const requester = await insertUser();
      const decider = await insertUser();
      const approved = await insertRequest({
        requester_id: requester.id,
        status: 'approved',
        decided_by: decider.id,
        decided_at: new Date(),
      });

      await expect(repo().decide(approved.id, 'rejected', decider.id)).rejects.toThrow(
        /approved から rejected/,
      );
    });

    it('存在しない id は RequestNotFoundError', async () => {
      await expect(
        repo().submit('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000001'),
      ).rejects.toThrow(RequestNotFoundError);
    });
  });

  describe('スキーマ制約', () => {
    it('決裁済みなのに decided_at が無い行は入れられない', async () => {
      const requester = await insertUser();

      await expect(
        insertRequest({ requester_id: requester.id, status: 'approved', decided_at: null }),
      ).rejects.toThrow(/requests_decided_consistency/);
    });

    // 決裁の記録は人事の変更より寿命が長い。退職者のアカウントを消しても、
    // その人が出した申請は金額ごと残す。
    it('申請者を削除しても申請は残り、申請者名だけが消える', async () => {
      const requester = await insertUser();
      const decider = await insertUser();
      const req = await insertRequest({
        requester_id: requester.id,
        status: 'approved',
        decided_by: decider.id,
        decided_at: new Date(),
      });

      await tx().query('DELETE FROM users WHERE id = $1', [requester.id]);

      const reloaded = await repo().findById(req.id);
      expect(reloaded?.status).toBe('approved');
      expect(reloaded?.amount).toBe(req.amount);
      expect(reloaded?.requester_id).toBeNull();
      expect(reloaded?.requester_name).toBeNull();
    });

    it('申請者を消しても一覧から落ちない（内部結合にしない）', async () => {
      const requester = await insertUser();
      const req = await insertRequest({ requester_id: requester.id });

      await tx().query('DELETE FROM users WHERE id = $1', [requester.id]);

      const page = await repo().list({ limit: 50 });
      expect(page.items.map((r) => r.id)).toContain(req.id);
    });

    it('決裁者を削除しても申請は残り、決裁者名だけが消える', async () => {
      const requester = await insertUser();
      const decider = await insertUser();
      const req = await insertRequest({
        requester_id: requester.id,
        status: 'approved',
        decided_by: decider.id,
        decided_at: new Date(),
      });

      await tx().query('DELETE FROM users WHERE id = $1', [decider.id]);

      const reloaded = await repo().findById(req.id);
      expect(reloaded?.status).toBe('approved');
      expect(reloaded?.decided_by).toBeNull();
      expect(reloaded?.decider_name).toBeNull();
    });
  });

  describe('countByStatus', () => {
    it('状態ごとに数える', async () => {
      const requester = await insertUser();
      await insertRequest({ requester_id: requester.id, status: 'pending' });
      await insertRequest({ requester_id: requester.id, status: 'pending' });
      await insertRequest({ requester_id: requester.id, status: 'draft' });

      await expect(repo().countByStatus('pending')).resolves.toBe(2);
      await expect(repo().countByStatus('rejected')).resolves.toBe(0);
    });
  });
});
