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
  password: string;
  status?: UserStatus;
}

/** ログイン照合に使う最小限の情報。password_hash を UserRow に含めないための型。 */
export interface UserCredentials {
  id: string;
  password_hash: string;
}

/** sessions テーブルの1行。 */
export interface SessionRow {
  token: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
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

/** 申請の状態。approved / rejected は終端。 */
export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/** requests テーブルの1行。 */
export interface RequestRow {
  id: string;
  title: string;
  amount: number;
  status: RequestStatus;
  /** 申請者。アカウントが削除されると null になる（申請自体は残る）。 */
  requester_id: string | null;
  decided_by: string | null;
  created_at: Date;
  decided_at: Date | null;
}

/** 一覧表示用に申請者名を添えた行。名前はアカウント削除で失われる。 */
export interface RequestWithNames extends RequestRow {
  requester_name: string | null;
  decider_name: string | null;
}

/** 申請の新規作成入力。 */
export interface NewRequest {
  title: string;
  amount: number;
  requesterId: string;
}
