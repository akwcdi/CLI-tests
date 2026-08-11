import { SESSION_COOKIE, UserNotFoundError, ValidationError, verifyPassword } from '@test/core';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { requireSession } from './auth.ts';
import { describeError, UnauthorizedError } from './errors.ts';
import { EVENT_TYPES, recordEvent } from './events.ts';
import {
  readCursor,
  readJsonObject,
  readLimit,
  readOptionalString,
  readStatus,
  readString,
} from './request.ts';
import type { AppEnv, Deps } from './types.ts';

/**
 * ユーザー管理コンソールの API。
 *
 * ハンドラは「入力を検証して core を呼び、結果を JSON にする」だけに保つ。
 * 判断が必要になったら core 側へ寄せること。
 */
export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const { users, auth, events } = deps;

  app.onError((error, c) => {
    const { status, body } = describeError(error);
    return c.json(body, status);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/login', async (c) => {
    const body = await readJsonObject(c.req);
    const email = readString(body, 'email');
    const password = readString(body, 'password');

    const credentials = await auth.findCredentialsByEmail(email);
    // ユーザーが居ない場合とパスワード違いを区別しない。
    if (credentials === null || !(await verifyPassword(password, credentials.password_hash))) {
      throw new UnauthorizedError('email or password is incorrect');
    }

    const session = await auth.createSession(credentials.id);
    setCookie(c, SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      expires: session.expires_at,
    });

    await recordEvent(events, credentials.id, EVENT_TYPES.loggedIn);

    const user = await auth.findUserBySession(session.token);
    if (user === null) {
      throw new Error('session vanished right after creation');
    }
    return c.json({ user });
  });

  app.post('/api/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token !== undefined) {
      await auth.deleteSession(token);
    }
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  // ここから下はすべて認証必須。
  app.use('/api/me', requireSession(auth));
  app.use('/api/users', requireSession(auth));
  app.use('/api/users/*', requireSession(auth));

  app.get('/api/me', (c) => c.json({ user: c.get('user') }));

  app.get('/api/users', async (c) => {
    const page = await users.list({
      limit: readLimit(c.req.query('limit')),
      cursor: readCursor(c.req.query('cursor')),
    });
    return c.json(page);
  });

  app.post('/api/users', async (c) => {
    const body = await readJsonObject(c.req);
    const created = await users.create({
      email: readString(body, 'email'),
      name: readString(body, 'name'),
      password: readString(body, 'password'),
      status: readOptionalString(body, 'status') as 'active' | 'suspended' | undefined,
    });

    await recordEvent(events, created.id, EVENT_TYPES.created, {
      email: created.email,
      name: created.name,
    });

    return c.json({ user: created }, 201);
  });

  app.get('/api/users/:id', async (c) => {
    const id = c.req.param('id');
    const user = await users.findById(id);
    if (user === null) {
      throw new UserNotFoundError(id);
    }
    return c.json({ user });
  });

  app.patch('/api/users/:id/status', async (c) => {
    const id = c.req.param('id');
    const body = await readJsonObject(c.req);
    const next = readStatus(body, 'status');

    const updated = await users.updateStatus(id, next);
    await recordEvent(events, id, EVENT_TYPES.statusChanged, { status: next });

    return c.json({ user: updated });
  });

  app.delete('/api/users/:id', async (c) => {
    const id = c.req.param('id');
    // 自分自身を消すとログイン状態が壊れるので拒否する。
    if (c.get('user').id === id) {
      throw new ValidationError('id', 'cannot delete the currently signed-in user');
    }

    const deleted = await users.deleteById(id);
    if (!deleted) {
      throw new UserNotFoundError(id);
    }
    await recordEvent(events, id, EVENT_TYPES.deleted);

    return c.body(null, 204);
  });

  app.get('/api/users/:id/events', async (c) => {
    const page = await events.listByUser(c.req.param('id'), {
      limit: readLimit(c.req.query('limit')),
      cursor: readCursor(c.req.query('cursor')),
    });
    return c.json(page);
  });

  return app;
}
