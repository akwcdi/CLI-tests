/**
 * 型定義のみ。実行時コードを置かないこと。
 * このファイルは coverage.exclude の許可リストに含まれる。
 */
import type { AuthRepository, EventStore, UserRepository, UserRow } from '@test/core';

/**
 * ハンドラが必要とする操作だけを構造的に切り出したもの。
 * 実体は core のクラスがそのまま満たし、UT では素のオブジェクトを渡せる。
 */
export type UsersPort = Pick<
  UserRepository,
  'create' | 'findById' | 'list' | 'updateStatus' | 'deleteById'
>;

export type AuthPort = Pick<
  AuthRepository,
  'findCredentialsByEmail' | 'createSession' | 'findUserBySession' | 'deleteSession'
>;

export type EventsPort = Pick<EventStore, 'append' | 'listByUser'>;

/** createApp に渡す依存一式。 */
export interface Deps {
  users: UsersPort;
  auth: AuthPort;
  events: EventsPort;
}

/** 認証ミドルウェアが c.set する値。 */
export interface AppVariables {
  user: UserRow;
}

export interface AppEnv {
  Variables: AppVariables;
}

/** エラー応答の本文。 */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
