import type { EventsPort } from './types.ts';

/** 監査イベントの種別。画面の履歴表示にそのまま出る。 */
export const EVENT_TYPES = {
  created: 'user.created',
  statusChanged: 'user.status_changed',
  deleted: 'user.deleted',
  loggedIn: 'user.logged_in',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/**
 * 変更操作を DynamoDB に記録する。
 *
 * PostgreSQL 側の変更が成功した後に呼ぶ。ここが失敗しても
 * 本体の操作は巻き戻らない（監査ログはベストエフォート）。
 */
export async function recordEvent(
  events: EventsPort,
  userId: string,
  type: EventType,
  payload: Record<string, unknown> = {},
  now: Date = new Date(),
): Promise<void> {
  await events.append({
    userId,
    occurredAt: now.toISOString(),
    type,
    payload,
  });
}
