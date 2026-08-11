import {
  RequestNotFoundError,
  SESSION_COOKIE,
  UserNotFoundError,
  ValidationError,
  verifyPassword,
} from '@test/core';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { requireSession } from './auth.ts';
import { describeError, UnauthorizedError } from './errors.ts';
import { EVENT_TYPES, recordEvent } from './events.ts';
import {
  readAmount,
  readCursor,
  readDecision,
  readJsonObject,
  readLimit,
  readOptionalString,
  readRequestStatus,
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
  const { users, auth, events, requests } = deps;

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
  app.use('/api/requests', requireSession(auth));
  app.use('/api/requests/*', requireSession(auth));
  app.use('/api/overview', requireSession(auth));

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

  // アプリトップの指標。2 アプリぶんを 1 往復で返す。
  app.get('/api/overview', async (c) => {
    const [userCount, pending] = await Promise.all([
      users.countAll(),
      requests.countByStatus('pending'),
    ]);
    return c.json({ users: userCount, pendingRequests: pending });
  });

  app.get('/api/requests', async (c) => {
    const page = await requests.list({
      limit: readLimit(c.req.query('limit')),
      cursor: readCursor(c.req.query('cursor')),
      status: readRequestStatus(c.req.query('status')),
    });
    return c.json(page);
  });

  app.post('/api/requests', async (c) => {
    const body = await readJsonObject(c.req);
    const created = await requests.create({
      title: readString(body, 'title'),
      amount: readAmount(body, 'amount'),
      // 申請者は常にサインイン中の本人。クライアントの指定は受け付けない。
      requesterId: c.get('user').id,
    });

    await recordEvent(events, created.id, EVENT_TYPES.requestCreated, {
      title: created.title,
      amount: created.amount,
    });

    return c.json({ request: created }, 201);
  });

  app.get('/api/requests/:id', async (c) => {
    const id = c.req.param('id');
    const found = await requests.findById(id);
    if (found === null) {
      throw new RequestNotFoundError(id);
    }
    return c.json({ request: found });
  });

  app.post('/api/requests/:id/submit', async (c) => {
    const id = c.req.param('id');
    const updated = await requests.submit(id);
    await recordEvent(events, id, EVENT_TYPES.requestSubmitted);
    return c.json({ request: updated });
  });

  app.post('/api/requests/:id/decision', async (c) => {
    const id = c.req.param('id');
    const body = await readJsonObject(c.req);
    const decision = readDecision(body, 'decision');

    const updated = await requests.decide(id, decision, c.get('user').id);
    await recordEvent(
      events,
      id,
      decision === 'approved' ? EVENT_TYPES.requestApproved : EVENT_TYPES.requestRejected,
      { decidedBy: c.get('user').id },
    );

    return c.json({ request: updated });
  });

  app.get('/api/requests/:id/events', async (c) => {
    const page = await events.listByUser(c.req.param('id'), {
      limit: readLimit(c.req.query('limit')),
      cursor: readCursor(c.req.query('cursor')),
    });
    return c.json(page);
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
