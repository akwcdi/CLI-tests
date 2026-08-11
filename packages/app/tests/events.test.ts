import { describe, expect, it, vi } from 'vitest';

import { EVENT_TYPES, recordEvent } from '../src/events.ts';
import type { EventsPort } from '../src/types.ts';

function createEvents() {
  const append = vi.fn<EventsPort['append']>();
  const listByUser = vi.fn<EventsPort['listByUser']>();
  return { events: { append, listByUser } satisfies EventsPort, append };
}

describe('recordEvent', () => {
  it('userId / type / occurredAt を組み立てて append する', async () => {
    const { events, append } = createEvents();
    const now = new Date('2026-05-05T10:00:00.000Z');

    await recordEvent(events, 'u1', EVENT_TYPES.created, { email: 'a@example.com' }, now);

    expect(append).toHaveBeenCalledWith({
      userId: 'u1',
      occurredAt: '2026-05-05T10:00:00.000Z',
      type: 'user.created',
      payload: { email: 'a@example.com' },
    });
  });

  it('payload を省略すると空オブジェクトになる', async () => {
    const { events, append } = createEvents();

    await recordEvent(events, 'u1', EVENT_TYPES.deleted, undefined, new Date(0));

    expect(append.mock.calls[0]?.[0].payload).toEqual({});
  });

  it('now を省略すると現在時刻を使う', async () => {
    const { events, append } = createEvents();
    const before = Date.now();

    await recordEvent(events, 'u1', EVENT_TYPES.loggedIn);

    const occurredAt = Date.parse(append.mock.calls[0]?.[0].occurredAt ?? '');
    expect(occurredAt).toBeGreaterThanOrEqual(before);
  });
});

describe('EVENT_TYPES', () => {
  it('画面に出る種別が揃っている', () => {
    expect(EVENT_TYPES).toEqual({
      created: 'user.created',
      statusChanged: 'user.status_changed',
      deleted: 'user.deleted',
      loggedIn: 'user.logged_in',
    });
  });
});
