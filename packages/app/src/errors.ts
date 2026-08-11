import {
  InvalidCursorError,
  RequestNotFoundError,
  UserNotFoundError,
  ValidationError,
} from '@test/core';

import type { ErrorBody } from './types.ts';

/** 認証が必要なのに通っていない場合に投げる。 */
export class UnauthorizedError extends Error {
  constructor(message = 'authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export interface HttpError {
  status: 400 | 401 | 404 | 500;
  body: ErrorBody;
}

/**
 * ドメイン例外を HTTP 応答に対応づける。
 * 未知の例外は握りつぶして 500 にする（内部情報を外に出さない）。
 */
export function describeError(error: unknown): HttpError {
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: { error: { code: 'validation_error', message: error.message, field: error.field } },
    };
  }
  if (error instanceof InvalidCursorError) {
    return { status: 400, body: { error: { code: 'invalid_cursor', message: error.message } } };
  }
  if (error instanceof UnauthorizedError) {
    return { status: 401, body: { error: { code: 'unauthorized', message: error.message } } };
  }
  if (error instanceof UserNotFoundError || error instanceof RequestNotFoundError) {
    return { status: 404, body: { error: { code: 'not_found', message: error.message } } };
  }
  return {
    status: 500,
    body: { error: { code: 'internal_error', message: 'internal server error' } },
  };
}
