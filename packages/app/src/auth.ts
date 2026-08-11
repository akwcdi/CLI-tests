import { SESSION_COOKIE } from '@test/core';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

import { UnauthorizedError } from './errors.ts';
import type { AppEnv, AuthPort } from './types.ts';

/**
 * セッション Cookie を検証し、通ったユーザーを `c.set('user', ...)` に載せる。
 * 通らなければ UnauthorizedError を投げ、onError が 401 にする。
 */
export function requireSession(auth: AuthPort): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token === undefined) {
      throw new UnauthorizedError();
    }

    const user = await auth.findUserBySession(token);
    if (user === null) {
      throw new UnauthorizedError('session is invalid or expired');
    }

    c.set('user', user);
    await next();
  };
}
