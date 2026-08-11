import { describe, expect, it } from 'vitest';

import { canTransitionRequest, isDecided, validateNewRequest } from '../src/request.ts';
import type { NewRequest } from '../src/types.ts';
import { ValidationError } from '../src/user.ts';

describe('canTransitionRequest', () => {
  it.each([
    ['draft', 'pending', true],
    ['pending', 'approved', true],
    ['pending', 'rejected', true],
    // 決裁済みは終端。取り消したい場合は新しい申請を出す。
    ['approved', 'rejected', false],
    ['rejected', 'approved', false],
    ['approved', 'pending', false],
    // 下書きから直接決裁はできない。
    ['draft', 'approved', false],
    ['draft', 'rejected', false],
    ['pending', 'draft', false],
    ['draft', 'draft', false],
  ] as const)('%s -> %s は %s', (from, to, expected) => {
    expect(canTransitionRequest(from, to)).toBe(expected);
  });
});

describe('isDecided', () => {
  it.each([
    ['draft', false],
    ['pending', false],
    ['approved', true],
    ['rejected', true],
  ] as const)('%s は %s', (status, expected) => {
    expect(isDecided(status)).toBe(expected);
  });
});

describe('validateNewRequest', () => {
  const input = (overrides: Partial<NewRequest> = {}): NewRequest => ({
    title: '備品購入',
    amount: 12000,
    requesterId: 'user-1',
    ...overrides,
  });

  it('件名の前後の空白を落として返す', () => {
    expect(validateNewRequest(input({ title: '  備品購入  ' }))).toEqual({
      title: '備品購入',
      amount: 12000,
      requesterId: 'user-1',
    });
  });

  it('件名が空（空白のみ含む）なら ValidationError', () => {
    expect(() => validateNewRequest(input({ title: '   ' }))).toThrowError(
      new ValidationError('title', '件名を入力してください'),
    );
  });

  it('件名が 120 文字を超えたら ValidationError', () => {
    expect(() => validateNewRequest(input({ title: 'あ'.repeat(121) }))).toThrow(
      /120文字以内/,
    );
  });

  it('件名がちょうど 120 文字なら通る', () => {
    const title = 'あ'.repeat(120);

    expect(validateNewRequest(input({ title })).title).toBe(title);
  });

  it.each([[1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    '金額が整数でなければ ValidationError: %s',
    (amount) => {
      expect(() => validateNewRequest(input({ amount }))).toThrowError(
        new ValidationError('amount', '金額は整数で入力してください'),
      );
    },
  );

  it.each([[0], [-1]])('金額が 1 未満なら ValidationError: %s', (amount) => {
    expect(() => validateNewRequest(input({ amount }))).toThrow(/1以上/);
  });

  it('金額が上限を超えたら ValidationError', () => {
    expect(() => validateNewRequest(input({ amount: 100_000_001 }))).toThrow(/以下/);
  });

  it('金額が上限ちょうどなら通る', () => {
    expect(validateNewRequest(input({ amount: 100_000_000 })).amount).toBe(100_000_000);
  });

  it('申請者が空なら ValidationError', () => {
    expect(() => validateNewRequest(input({ requesterId: '' }))).toThrowError(
      new ValidationError('requesterId', '申請者が指定されていません'),
    );
  });
});
