import { describe, expect, it } from 'vitest';

import { ValidationError } from '@test/core';

import {
  readAmount,
  readCursor,
  readDecision,
  readRequestStatus,
  readJsonObject,
  readLimit,
  readOptionalString,
  readStatus,
  readString,
} from '../src/request.ts';

/** c.req のうち json() だけを模したもの。 */
const req = (impl: () => Promise<unknown>) => ({ json: impl });

describe('readJsonObject', () => {
  it('オブジェクトならそのまま返す', async () => {
    await expect(readJsonObject(req(async () => ({ a: 1 })))).resolves.toEqual({ a: 1 });
  });

  it('JSON として壊れていれば ValidationError', async () => {
    await expect(
      readJsonObject(
        req(() => Promise.reject(new SyntaxError('Unexpected token'))),
      ),
    ).rejects.toThrowError(new ValidationError('body', 'request body must be valid JSON'));
  });

  it.each([
    ['配列', [] as unknown],
    ['null', null],
    ['数値', 1],
    ['文字列', 'x'],
  ])('オブジェクトでなければ ValidationError: %s', async (_label, value) => {
    await expect(readJsonObject(req(async () => value))).rejects.toThrow(
      /request body must be a JSON object/,
    );
  });
});

describe('readString', () => {
  it('文字列ならそのまま返す（空文字も通す）', () => {
    expect(readString({ name: 'Taro' }, 'name')).toBe('Taro');
    expect(readString({ name: '' }, 'name')).toBe('');
  });

  it.each([
    ['未指定', {}],
    ['数値', { name: 1 }],
    ['null', { name: null }],
  ])('文字列でなければ ValidationError: %s', (_label, body) => {
    expect(() => readString(body, 'name')).toThrowError(
      new ValidationError('name', 'name must be a string'),
    );
  });
});

describe('readOptionalString', () => {
  it('未指定なら undefined', () => {
    expect(readOptionalString({}, 'status')).toBeUndefined();
  });

  it('文字列ならそのまま返す', () => {
    expect(readOptionalString({ status: 'active' }, 'status')).toBe('active');
  });

  it('指定されていて文字列でなければ ValidationError', () => {
    expect(() => readOptionalString({ status: 1 }, 'status')).toThrow(ValidationError);
  });
});

describe('readStatus', () => {
  it.each([['active'], ['suspended']])('%s は通る', (status) => {
    expect(readStatus({ status }, 'status')).toBe(status);
  });

  it('許可外の値は ValidationError', () => {
    expect(() => readStatus({ status: 'deleted' }, 'status')).toThrowError(
      new ValidationError('status', 'status must be "active" or "suspended"'),
    );
  });

  it('文字列でなければ ValidationError', () => {
    expect(() => readStatus({ status: 3 }, 'status')).toThrow(/status must be a string/);
  });
});

describe('readLimit', () => {
  it('未指定なら undefined（既定値は core に委ねる）', () => {
    expect(readLimit(undefined)).toBeUndefined();
  });

  it('正の整数ならその値', () => {
    expect(readLimit('25')).toBe(25);
  });

  it.each([['0'], ['-1'], ['1.5'], ['abc'], ['']])(
    '正の整数でなければ ValidationError: %s',
    (raw) => {
      expect(() => readLimit(raw)).toThrowError(
        new ValidationError('limit', 'limit must be a positive integer'),
      );
    },
  );
});

describe('readCursor', () => {
  it('未指定なら null', () => {
    expect(readCursor(undefined)).toBeNull();
  });

  it('指定があればそのまま返す', () => {
    expect(readCursor('abc')).toBe('abc');
  });
});

describe('readDecision', () => {
  it.each([['approved'], ['rejected']])('%s は通る', (decision) => {
    expect(readDecision({ decision }, 'decision')).toBe(decision);
  });

  it.each([
    ['未指定', {}],
    ['許可外の値', { decision: 'pending' }],
    ['文字列でない', { decision: 1 }],
  ])('%s なら ValidationError', (_label, body) => {
    expect(() => readDecision(body, 'decision')).toThrowError(
      new ValidationError('decision', 'decision must be "approved" or "rejected"'),
    );
  });
});

describe('readRequestStatus', () => {
  it('未指定なら undefined（絞り込まない）', () => {
    expect(readRequestStatus(undefined)).toBeUndefined();
  });

  it.each([['draft'], ['pending'], ['approved'], ['rejected']])('%s は通る', (status) => {
    expect(readRequestStatus(status)).toBe(status);
  });

  it('許可外の値は ValidationError', () => {
    expect(() => readRequestStatus('unknown')).toThrowError(
      new ValidationError('status', 'status の値が不正です'),
    );
  });
});

describe('readAmount', () => {
  it('数値ならそのまま返す', () => {
    expect(readAmount({ amount: 12000 }, 'amount')).toBe(12000);
  });

  it.each([
    ['未指定', {}],
    ['文字列', { amount: '12000' }],
    ['NaN', { amount: Number.NaN }],
    ['Infinity', { amount: Number.POSITIVE_INFINITY }],
  ])('数値でなければ ValidationError: %s', (_label, body) => {
    expect(() => readAmount(body, 'amount')).toThrowError(
      new ValidationError('amount', 'amount must be a number'),
    );
  });
});
