import { describe, expect, it } from 'vitest';

import { InvalidCursorError, UserNotFoundError, ValidationError } from '@test/core';

import { describeError, UnauthorizedError } from '../src/errors.ts';

describe('UnauthorizedError', () => {
  it('既定メッセージを持つ', () => {
    const error = new UnauthorizedError();

    expect(error.name).toBe('UnauthorizedError');
    expect(error.message).toBe('authentication required');
  });

  it('メッセージを差し替えられる', () => {
    expect(new UnauthorizedError('expired').message).toBe('expired');
  });
});

describe('describeError', () => {
  it('ValidationError は 400 で field を含む', () => {
    expect(describeError(new ValidationError('email', 'bad email'))).toEqual({
      status: 400,
      body: { error: { code: 'validation_error', message: 'bad email', field: 'email' } },
    });
  });

  it('InvalidCursorError は 400', () => {
    expect(describeError(new InvalidCursorError('xyz'))).toEqual({
      status: 400,
      body: { error: { code: 'invalid_cursor', message: 'invalid cursor: xyz' } },
    });
  });

  it('UnauthorizedError は 401', () => {
    expect(describeError(new UnauthorizedError())).toEqual({
      status: 401,
      body: { error: { code: 'unauthorized', message: 'authentication required' } },
    });
  });

  it('UserNotFoundError は 404', () => {
    expect(describeError(new UserNotFoundError('abc'))).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'user not found: abc' } },
    });
  });

  it.each([
    ['素の Error', new Error('boom at line 42')],
    ['文字列', 'boom'],
  ])('未知の例外は 500 で内部情報を漏らさない: %s', (_label, thrown) => {
    const described = describeError(thrown);

    expect(described.status).toBe(500);
    expect(described.body).toEqual({
      error: { code: 'internal_error', message: 'internal server error' },
    });
    expect(JSON.stringify(described.body)).not.toContain('boom');
  });
});
