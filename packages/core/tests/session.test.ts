import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  isSessionExpired,
  SESSION_TTL_MS,
  sessionExpiresAt,
} from '../src/session.ts';

describe('createSessionToken', () => {
  it('URL 安全な文字だけで構成される', () => {
    expect(createSessionToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('呼ぶたびに異なる値になる', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => createSessionToken()));

    expect(tokens.size).toBe(20);
  });
});

describe('sessionExpiresAt', () => {
  it('既定では 24 時間後', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(sessionExpiresAt(now).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(SESSION_TTL_MS).toBe(86_400_000);
  });

  it('TTL を指定できる', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(sessionExpiresAt(now, 60_000).toISOString()).toBe('2026-01-01T00:01:00.000Z');
  });

  it('引数を省略すると現在時刻を基準にする', () => {
    const before = Date.now();
    const expires = sessionExpiresAt().getTime();

    expect(expires).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
  });
});

describe('isSessionExpired', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it.each([
    ['期限が未来', '2026-01-01T12:00:01.000Z', false],
    ['期限ちょうど', '2026-01-01T12:00:00.000Z', true],
    ['期限が過去', '2026-01-01T11:59:59.000Z', true],
  ])('%s なら %s', (_label, expiresAt, expected) => {
    expect(isSessionExpired(new Date(expiresAt), now)).toBe(expected);
  });

  it('now を省略すると現在時刻と比較する', () => {
    expect(isSessionExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isSessionExpired(new Date(Date.now() + 60_000))).toBe(false);
  });
});
