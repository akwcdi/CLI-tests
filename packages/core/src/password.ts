import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const ALGORITHM = 'scrypt';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * パスワードを `scrypt$<salt>$<key>` 形式の文字列にする。
 * salt は毎回変わるので、同じ入力でも結果は一致しない。
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(plain, salt, KEY_LENGTH);
  return `${ALGORITHM}$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * 保存済みハッシュと平文を突き合わせる。
 * 形式が壊れている場合は例外にせず false を返す。
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = stored.split('$');
  if (algorithm !== ALGORITHM || saltHex === undefined || keyHex === undefined) {
    return false;
  }

  const expected = Buffer.from(keyHex, 'hex');
  // 不正な16進が混ざると短く切り詰められる。長さが違うと
  // timingSafeEqual が例外を投げるので、先に弾く。
  if (expected.length !== KEY_LENGTH) {
    return false;
  }

  const actual = await scrypt(plain, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}
