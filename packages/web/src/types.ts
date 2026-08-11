/**
 * 型定義のみ。実行時コードを置かないこと。
 * このファイルは coverage.exclude の許可リストに含まれる。
 *
 * API 応答の形。サーバー側の UserRow は created_at が Date だが、
 * JSON を経由するとここでは文字列になる。
 */

export type UserStatus = 'active' | 'suspended';

export interface User {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: string;
}

export interface UserEvent {
  userId: string;
  occurredAt: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
