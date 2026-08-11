import { randomBytes } from 'node:crypto';

/** セッションの既定有効期間（24時間）。 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Cookie に載せるセッショントークンの名前。 */
export const SESSION_COOKIE = 'session';

/** 推測不可能なセッショントークンを作る。 */
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 発行時刻から有効期限を求める。 */
export function sessionExpiresAt(now: Date = new Date(), ttlMs: number = SESSION_TTL_MS): Date {
  return new Date(now.getTime() + ttlMs);
}

/** 期限切れかどうか。期限ちょうどは切れている扱い。 */
export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
