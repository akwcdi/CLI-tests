/**
 * パッケージのエントリポイント。再エクスポートのみを置く。
 * このファイルは coverage.exclude の許可リストに含まれる。
 *
 * サーバーを起動する処理は `packages/app/server.ts`（src の外）にある。
 * import しただけでポートを掴まないようにするため。
 */
export { createApp } from './app.ts';
export { describeError, UnauthorizedError, type HttpError } from './errors.ts';
export { EVENT_TYPES, recordEvent, type EventType } from './events.ts';
export { createDeps } from './db.ts';
export { appConfig } from './config.ts';
export type {
  AppEnv,
  AppVariables,
  AuthPort,
  Deps,
  ErrorBody,
  EventsPort,
  UsersPort,
} from './types.ts';
