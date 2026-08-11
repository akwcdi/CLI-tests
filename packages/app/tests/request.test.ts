import { describe, expect, it } from 'vitest';

import { ValidationError } from '@test/core';

import {
  readCursor,
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
