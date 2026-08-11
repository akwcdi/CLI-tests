import { ValidationError } from '@test/core';

import type { UserStatus } from '@test/core';

/**
 * リクエストの読み取りと検証。
 *
 * ここで型を絞ってから core に渡すことで、ハンドラ側に分岐を残さない。
 * 失敗はすべて ValidationError にして 400 へ落とす。
 */

/** JSON ボディをオブジェクトとして読む。壊れていれば ValidationError。 */
export async function readJsonObject(
  request: { json(): Promise<unknown> },
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ValidationError('body', 'request body must be valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError('body', 'request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** 必須の文字列項目を取り出す。 */
export function readString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string') {
    throw new ValidationError(field, `${field} must be a string`);
  }
  return value;
}

/** 任意の文字列項目を取り出す。未指定なら undefined。 */
export function readOptionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  if (body[field] === undefined) {
    return undefined;
  }
  return readString(body, field);
}

/** ステータス値を検証して取り出す。 */
export function readStatus(body: Record<string, unknown>, field: string): UserStatus {
  const value = readString(body, field);
  if (value !== 'active' && value !== 'suspended') {
    throw new ValidationError(field, `${field} must be "active" or "suspended"`);
  }
  return value;
}

/** クエリの limit。未指定なら undefined を返し、既定値は core 側に委ねる。 */
export function readLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError('limit', 'limit must be a positive integer');
  }
  return value;
}

/** クエリの cursor。未指定なら null（先頭ページ）。 */
export function readCursor(raw: string | undefined): string | null {
  return raw ?? null;
}
