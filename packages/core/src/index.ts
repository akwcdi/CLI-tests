/**
 * パッケージのエントリポイント。再エクスポートのみを置く。
 * このファイルは coverage.exclude の許可リストに含まれる。
 */
export { AuthRepository } from './auth-repository.ts';
export { config } from './config.ts';
export { createPool, createDynamoDocumentClient } from './db.ts';
export { EventStore, InvalidCursorError, encodeCursor, decodeCursor } from './event-store.ts';
export { hashPassword, verifyPassword } from './password.ts';
export {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  isSessionExpired,
  sessionExpiresAt,
} from './session.ts';
export { UserRepository, UserNotFoundError, type Queryable } from './user-repository.ts';
export { ValidationError, canTransition, normalizeEmail, validateNewUser } from './user.ts';
export type {
  EventItem,
  NewUser,
  Page,
  SessionRow,
  UserCredentials,
  UserRow,
  UserStatus,
} from './types.ts';
