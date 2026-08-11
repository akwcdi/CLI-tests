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

export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/** 申請。申請者名・決裁者名を含む一覧/詳細用の形。 */
export interface ApprovalRequest {
  id: string;
  title: string;
  amount: number;
  status: RequestStatus;
  /** 申請者。アカウントが削除されると null になる（申請自体は残る）。 */
  requester_id: string | null;
  requester_name: string | null;
  decided_by: string | null;
  decider_name: string | null;
  created_at: string;
  decided_at: string | null;
}

/** アプリトップに出す指標。 */
export interface Overview {
  users: number;
  pendingRequests: number;
}
