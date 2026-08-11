import { describe, expect, it } from 'vitest';

import {
  canTransition,
  normalizeEmail,
  validateNewUser,
  ValidationError,
} from '../src/user.ts';

describe('normalizeEmail', () => {
  it('前後の空白を落として小文字にする', () => {
    expect(normalizeEmail('  Foo.Bar@Example.COM ')).toBe('foo.bar@example.com');
  });

  it('すでに正規化済みの値はそのまま返す', () => {
    expect(normalizeEmail('foo@example.com')).toBe('foo@example.com');
  });
});

describe('ValidationError', () => {
  it('field と name を保持する', () => {
    const error = new ValidationError('email', 'bad');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ValidationError');
    expect(error.field).toBe('email');
    expect(error.message).toBe('bad');
  });
});

describe('validateNewUser', () => {
  it('正規化した値を返し、status を省略すると active になる', () => {
    const result = validateNewUser({ email: ' USER@Example.com ', name: '  Taro  ' });

    expect(result).toEqual({ email: 'user@example.com', name: 'Taro', status: 'active' });
  });

  it('status を指定した場合はその値を使う', () => {
    const result = validateNewUser({
      email: 'user@example.com',
      name: 'Taro',
      status: 'suspended',
    });

    expect(result.status).toBe('suspended');
  });

  it('email が空文字（空白のみ含む）なら ValidationError', () => {
    expect(() => validateNewUser({ email: '   ', name: 'Taro' })).toThrowError(
      new ValidationError('email', 'email is required'),
    );
  });

  it.each([['no-at-mark'], ['no@domain'], ['sp ace@example.com'], ['a@b@example.com']])(
    'email の形式が不正なら ValidationError: %s',
    (email) => {
      expect(() => validateNewUser({ email, name: 'Taro' })).toThrow(ValidationError);
      expect(() => validateNewUser({ email, name: 'Taro' })).toThrow(/invalid email format/);
    },
  );

  it('name が空文字（空白のみ含む）なら ValidationError', () => {
    expect(() => validateNewUser({ email: 'user@example.com', name: '  ' })).toThrowError(
      new ValidationError('name', 'name is required'),
    );
  });

  it('name が 100 文字を超えたら ValidationError', () => {
    expect(() =>
      validateNewUser({ email: 'user@example.com', name: 'a'.repeat(101) }),
    ).toThrow(/100 characters or fewer/);
  });

  it('name がちょうど 100 文字なら通る', () => {
    const name = 'a'.repeat(100);

    expect(validateNewUser({ email: 'user@example.com', name }).name).toBe(name);
  });
});

describe('canTransition', () => {
  it.each([
    ['active', 'suspended', true],
    ['suspended', 'active', true],
    ['active', 'active', false],
    ['suspended', 'suspended', false],
  ] as const)('%s -> %s は %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});
