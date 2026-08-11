import { describe, expect, it } from 'vitest';

import type { NewUser } from '../src/types.ts';
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
  /** 妥当な入力を作り、検証したい項目だけ差し替える。 */
  const input = (overrides: Partial<NewUser> = {}): NewUser => ({
    email: 'user@example.com',
    name: 'Taro',
    password: 'password123',
    ...overrides,
  });

  it('正規化した値を返し、status を省略すると active になる', () => {
    const result = validateNewUser(input({ email: ' USER@Example.com ', name: '  Taro  ' }));

    expect(result).toEqual({
      email: 'user@example.com',
      name: 'Taro',
      password: 'password123',
      status: 'active',
    });
  });

  it('status を指定した場合はその値を使う', () => {
    expect(validateNewUser(input({ status: 'suspended' })).status).toBe('suspended');
  });

  it('email が空文字（空白のみ含む）なら ValidationError', () => {
    expect(() => validateNewUser(input({ email: '   ' }))).toThrowError(
      new ValidationError('email', 'email is required'),
    );
  });

  it.each([['no-at-mark'], ['no@domain'], ['sp ace@example.com'], ['a@b@example.com']])(
    'email の形式が不正なら ValidationError: %s',
    (email) => {
      expect(() => validateNewUser(input({ email }))).toThrow(ValidationError);
      expect(() => validateNewUser(input({ email }))).toThrow(/invalid email format/);
    },
  );

  it('name が空文字（空白のみ含む）なら ValidationError', () => {
    expect(() => validateNewUser(input({ name: '  ' }))).toThrowError(
      new ValidationError('name', 'name is required'),
    );
  });

  it('name が 100 文字を超えたら ValidationError', () => {
    expect(() => validateNewUser(input({ name: 'a'.repeat(101) }))).toThrow(
      /100 characters or fewer/,
    );
  });

  it('name がちょうど 100 文字なら通る', () => {
    const name = 'a'.repeat(100);

    expect(validateNewUser(input({ name })).name).toBe(name);
  });

  it('password が 8 文字未満なら ValidationError', () => {
    expect(() => validateNewUser(input({ password: '1234567' }))).toThrowError(
      new ValidationError('password', 'password must be at least 8 characters'),
    );
  });

  it('password はちょうど 8 文字で通り、空白も trim されない', () => {
    expect(validateNewUser(input({ password: '  pass  ' })).password).toBe('  pass  ');
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
