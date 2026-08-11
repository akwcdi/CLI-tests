/**
 * 型定義のみ。実行時コードを置かないこと。
 * このファイルは coverage.exclude の許可リストに含まれる。
 */

/** users テーブルの1行。 */
export interface UserRow {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: Date;
}

export type UserStatus = 'active' | 'suspended';

/** ユーザー新規作成の入力。 */
export interface NewUser {
  email: string;
  name: string;
  status?: UserStatus;
}

/** DynamoDB events テーブルの1アイテム。 */
export interface EventItem {
  /** パーティションキー。 */
  userId: string;
  /** ソートキー。ISO8601 のタイムスタンプ。 */
  occurredAt: string;
  type: string;
  payload: Record<string, unknown>;
}

/** ページング付き一覧の戻り値。 */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
