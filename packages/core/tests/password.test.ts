import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../src/password.ts';

describe('hashPassword', () => {
  it('scrypt$<salt>$<key> 形式を返す', async () => {
    const hash = await hashPassword('correct horse');

    const [algorithm, salt, key] = hash.split('$');
    expect(algorithm).toBe('scrypt');
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('salt が毎回変わるので同じ入力でもハッシュは一致しない', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);

    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('正しいパスワードなら true', async () => {
    const hash = await hashPassword('correct horse');

    await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
  });

  it('誤ったパスワードなら false', async () => {
    const hash = await hashPassword('correct horse');

    await expect(verifyPassword('wrong horse', hash)).resolves.toBe(false);
  });

  it.each([
    ['アルゴリズムが違う', 'bcrypt$00$11'],
    ['区切りが足りない（salt のみ）', 'scrypt'],
    ['区切りが足りない（key が無い）', 'scrypt$abcd'],
    ['空文字', ''],
  ])('形式が壊れていれば例外にせず false: %s', async (_label, stored) => {
    await expect(verifyPassword('any', stored)).resolves.toBe(false);
  });

  it('key の長さが 32 バイトでなければ false', async () => {
    // timingSafeEqual は長さ違いで例外を投げるため、手前で弾けていることを見る。
    await expect(verifyPassword('any', 'scrypt$00112233$aabb')).resolves.toBe(false);
  });
});
